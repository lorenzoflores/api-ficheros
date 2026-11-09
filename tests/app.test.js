'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

afterAll(() => pool.end());

describe('Comportamiento transversal de la app', () => {
  test('F-02: una ruta inexistente responde 404 NOT_FOUND con el formato estándar', async () => {
    const res = await request(app).get('/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  test('un JSON mal formado responde 400 VALIDATION_ERROR sin stack trace', async () => {
    const res = await request(app)
      .post('/health')
      .set('Content-Type', 'application/json')
      .send('{"roto":');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toMatch(/\n\s+at /);
  });

  test('helmet añade cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
