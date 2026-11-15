'use strict';

const crypto = require('node:crypto');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const requireAuth = require('../src/middleware/requireAuth');
const errorHandler = require('../src/middleware/errorHandler');
const { signAccessToken } = require('../src/services/tokenService');
const { config } = require('../src/config');

// App mínima: aún no hay endpoints de ficheros, así que el middleware se prueba aislado.
const app = express();
app.get('/protegido', requireAuth, (req, res) => res.json({ user: req.user }));
app.use(errorHandler);

const USER_ID = '6f1c2b6e-3d1a-4c55-9d7e-2b7f5e0a9c11';
const SECRET = () => config.jwt.secret;

const get = (authorization) => {
  const req = request(app).get('/protegido');
  return authorization === undefined ? req : req.set('Authorization', authorization);
};

const expectUnauthorized = (res) => {
  expect(res.status).toBe(401);
  expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
};

describe('middleware requireAuth', () => {
  test('con un token válido deja pasar y expone req.user.id = sub', async () => {
    const res = await get(`Bearer ${signAccessToken(USER_ID)}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ user: { id: USER_ID } });
  });

  test('A-05: sin cabecera Authorization responde 401 UNAUTHORIZED', async () => {
    expectUnauthorized(await get());
  });

  test.each([
    ['esquema distinto de Bearer', () => `Basic ${Buffer.from('ana:secreta123').toString('base64')}`],
    ['Bearer sin token', () => 'Bearer '],
    ['token sin el prefijo Bearer', () => signAccessToken(USER_ID)],
    ['token mal formado', () => 'Bearer esto.no.es-un-jwt'],
  ])('A-05: %s responde 401 UNAUTHORIZED', async (_caso, header) => {
    expectUnauthorized(await get(header()));
  });

  test('A-06: un token firmado con otro secreto responde 401 UNAUTHORIZED', async () => {
    const token = jwt.sign({}, crypto.randomBytes(48).toString('base64'), { subject: USER_ID });

    expectUnauthorized(await get(`Bearer ${token}`));
  });

  test('A-07: un token caducado responde 401 UNAUTHORIZED', async () => {
    const token = jwt.sign({ exp: Math.floor(Date.now() / 1000) - 10 }, SECRET(), { subject: USER_ID });

    expectUnauthorized(await get(`Bearer ${token}`));
  });

  test('un token sin firma (alg "none") responde 401 UNAUTHORIZED', async () => {
    const token = jwt.sign({ sub: USER_ID }, null, { algorithm: 'none' });

    expectUnauthorized(await get(`Bearer ${token}`));
  });

  test('un token válido pero sin "sub" responde 401 UNAUTHORIZED', async () => {
    const token = jwt.sign({}, SECRET(), { expiresIn: '1h' });

    expectUnauthorized(await get(`Bearer ${token}`));
  });
});
