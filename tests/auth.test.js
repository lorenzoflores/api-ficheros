'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const { pool, resetDb } = require('./helpers/db');

const EMAIL = 'ana@example.com';
const PASSWORD = 'secreta123';

const register = (body) => request(app).post('/auth/register').send(body);
const login = (body) => request(app).post('/auth/login').send(body);

const expectError = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
};

beforeEach(resetDb);
afterAll(() => pool.end());

describe('POST /auth/register', () => {
  test('E-02: crea el usuario y responde 201 con id y email, sin contraseña ni hash', async () => {
    const res = await register({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: expect.any(String), email: EMAIL });
    expect(JSON.stringify(res.body)).not.toMatch(/password|hash|secreta123/i);
  });

  test('guarda la contraseña con bcrypt, nunca en claro', async () => {
    const res = await register({ email: EMAIL, password: PASSWORD });

    const { rows } = await pool.query('SELECT password_hash FROM users WHERE id = $1', [res.body.id]);
    expect(rows[0].password_hash).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(rows[0].password_hash).not.toContain(PASSWORD);
  });

  test('normaliza el email: quita espacios y lo pasa a minúsculas', async () => {
    const res = await register({ email: '  Ana@Example.COM ', password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.email).toBe(EMAIL);
  });

  test('A-01: un email ya registrado responde 409 EMAIL_ALREADY_EXISTS', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    expectError(await register({ email: EMAIL, password: 'otraClave99' }), 409, 'EMAIL_ALREADY_EXISTS');
  });

  test('A-01: el mismo email con otras mayúsculas también responde 409', async () => {
    await register({ email: EMAIL, password: PASSWORD });

    expectError(await register({ email: 'ANA@example.com', password: PASSWORD }), 409, 'EMAIL_ALREADY_EXISTS');
  });

  test('dos registros simultáneos del mismo email: uno 201 y otro 409', async () => {
    const results = await Promise.all([
      register({ email: EMAIL, password: PASSWORD }),
      register({ email: EMAIL, password: PASSWORD }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  test.each([
    ['email con formato inválido', { email: 'no-es-un-email', password: PASSWORD }],
    ['contraseña de 7 caracteres', { email: EMAIL, password: '1234567' }],
    ['contraseña de más de 72 bytes', { email: EMAIL, password: 'ñ'.repeat(37) }],
    ['sin email', { password: PASSWORD }],
    ['sin contraseña', { email: EMAIL }],
    ['email que no es texto', { email: 123, password: PASSWORD }],
    ['contraseña que no es texto', { email: EMAIL, password: 12345678 }],
    ['cuerpo vacío', {}],
  ])('A-02: %s responde 400 VALIDATION_ERROR y no crea el usuario', async (_caso, body) => {
    expectError(await register(body), 400, 'VALIDATION_ERROR');

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM users');
    expect(rows[0].n).toBe(0);
  });

  test('A-02: un cuerpo que no es un objeto JSON responde 400 VALIDATION_ERROR', async () => {
    const res = await request(app).post('/auth/register').send([EMAIL, PASSWORD]);

    expectError(res, 400, 'VALIDATION_ERROR');
  });

  test('acepta una contraseña de exactamente 8 caracteres', async () => {
    const res = await register({ email: EMAIL, password: '12345678' });

    expect(res.status).toBe(201);
  });
});

describe('POST /auth/login', () => {
  let userId;

  beforeEach(async () => {
    const res = await register({ email: EMAIL, password: PASSWORD });
    userId = res.body.id;
  });

  test('E-03: con credenciales correctas responde 200 y un JWT HS256 con sub = id y caducidad de 1 hora', async () => {
    const res = await login({ email: EMAIL, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ token: expect.any(String) });

    const payload = jwt.verify(res.body.token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
    expect(payload.sub).toBe(userId);
    expect(payload.exp - payload.iat).toBe(3600);
  });

  test('el email del login no distingue mayúsculas ni espacios', async () => {
    const res = await login({ email: ' ANA@Example.com ', password: PASSWORD });

    expect(res.status).toBe(200);
  });

  test('A-03: una contraseña incorrecta responde 401 INVALID_CREDENTIALS', async () => {
    expectError(await login({ email: EMAIL, password: 'incorrecta1' }), 401, 'INVALID_CREDENTIALS');
  });

  test('A-04: un email inexistente responde 401 con el mismo cuerpo que una contraseña incorrecta', async () => {
    const wrongPassword = await login({ email: EMAIL, password: 'incorrecta1' });
    const unknownEmail = await login({ email: 'nadie@example.com', password: PASSWORD });

    expectError(unknownEmail, 401, 'INVALID_CREDENTIALS');
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });

  test.each([
    ['sin contraseña', { email: EMAIL }],
    ['contraseña vacía', { email: EMAIL, password: '' }],
    ['sin email', { password: PASSWORD }],
    ['email con formato inválido', { email: 'no-es-un-email', password: PASSWORD }],
  ])('%s responde 400 VALIDATION_ERROR', async (_caso, body) => {
    expectError(await login(body), 400, 'VALIDATION_ERROR');
  });
});
