'use strict';

const request = require('supertest');
const app = require('../src/app');
const { pool } = require('../src/db/pool');

afterEach(() => jest.restoreAllMocks());
afterAll(() => pool.end());

describe('GET /health', () => {
  test('E-01: responde 200 y { status: "ok" } cuando la base de datos responde', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  test('responde 503 con el formato de error si la base de datos no responde', async () => {
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:5432'));

    const res = await request(app).get('/health');

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      error: { code: 'SERVICE_UNAVAILABLE', message: expect.any(String) },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ECONNREFUSED|\n\s+at /);
  });
});
