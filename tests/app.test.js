'use strict';

const request = require('supertest');
const app = require('../src/app');
const { config } = require('../src/config');
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

  test('un JSON de más de 100 KB responde 413 PAYLOAD_TOO_LARGE sin stack trace', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ email: 'ana@example.com', password: 'a'.repeat(101 * 1024) }));

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: { code: 'PAYLOAD_TOO_LARGE', message: expect.any(String) } });
    expect(JSON.stringify(res.body)).not.toMatch(/\n\s+at /);
  });

  test('aplica TRUST_PROXY de la configuración (0 por defecto: no se confía en ningún proxy)', () => {
    expect(app.get('trust proxy')).toBe(config.trustProxy);
    expect(config.trustProxy).toBe(0);
  });

  test('helmet añade cabeceras de seguridad y oculta X-Powered-By', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
