'use strict';

const http = require('node:http');
const request = require('supertest');
const app = require('../src/app');
const { pool, resetDb } = require('./helpers/db');
const { createUser } = require('./helpers/auth');
const { fixtures } = require('./helpers/fixtures');

const METRICS_TOKEN = process.env.METRICS_TOKEN; // lo fija tests/setupEnv.js

afterAll(() => pool.end());

const getMetrics = (token = METRICS_TOKEN) => {
  const req = request(app).get('/metrics');
  return token === null ? req : req.set('Authorization', `Bearer ${token}`);
};

// Suma las muestras de una métrica cuyas etiquetas incluyan las indicadas.
function value(text, name, labels = {}) {
  let total = 0;
  for (const line of text.split('\n')) {
    const m = /^([a-z_]+)(?:\{(.*)\})? (\S+)$/.exec(line);
    if (!m || m[1] !== name) continue;
    const lineLabels = Object.fromEntries([...(m[2] ?? '').matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
    if (Object.entries(labels).every(([k, v]) => lineLabels[k] === v)) total += Number(m[3]);
  }
  return total;
}
const scrape = async () => (await getMetrics()).text;

describe('GET /metrics: autenticación', () => {
  test('sin token responde 401 UNAUTHORIZED', async () => {
    const res = await getMetrics(null);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'UNAUTHORIZED', message: expect.any(String) } });
  });

  test.each([
    ['un token incorrecto de la misma longitud', () => 'x'.repeat(METRICS_TOKEN.length)],
    ['un token incorrecto de otra longitud', () => 'otro-token-cualquiera-0123'],
    ['el token con un carácter de más', () => `${METRICS_TOKEN}x`],
  ])('con %s responde 401', async (_caso, token) => {
    expect((await getMetrics(token())).status).toBe(401);
  });

  test('con esquema Basic responde 401', async () => {
    const res = await request(app).get('/metrics').set('Authorization', `Basic ${METRICS_TOKEN}`);

    expect(res.status).toBe(401);
  });

  test('con el token correcto devuelve el formato de Prometheus', async () => {
    const res = await getMetrics();

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    for (const name of ['http_requests_total', 'http_request_duration_seconds', 'http_errors_total', 'files_uploaded_total', 'storage_bytes']) {
      expect(res.text).toContain(`# TYPE ${name} `);
    }
  });

  test('sin METRICS_TOKEN configurado el endpoint no existe (404)', async () => {
    const saved = process.env.METRICS_TOKEN;
    process.env.METRICS_TOKEN = '';
    let isolated;
    try {
      jest.isolateModules(() => {
        isolated = { app: require('../src/app'), pool: require('../src/db/pool').pool };
      });
      const res = await request(isolated.app).get('/metrics').set('Authorization', `Bearer ${saved}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    } finally {
      process.env.METRICS_TOKEN = saved;
      await isolated?.pool.end();
    }
  });
});

describe('Contenido de las métricas', () => {
  let user;

  beforeAll(async () => {
    await resetDb();
    user = await createUser('metricas@example.com');
  });

  const auth = () => ({ Authorization: `Bearer ${user.token}` });

  test('route es el patrón "/files/:id", nunca la URL real con el id del fichero', async () => {
    const up = await request(app).post('/files').set(auth()).attach('file', fixtures.text, 'notas.txt');
    const id = up.body.id;
    const before = await scrape();

    await request(app).get(`/files/${id}`).set(auth()).expect(200);
    await request(app).delete(`/files/${id}`).set(auth()).expect(204);
    await request(app).get(`/files/${id}`).set(auth()).expect(404);
    const after = await scrape();

    const delta = (labels) => value(after, 'http_requests_total', labels) - value(before, 'http_requests_total', labels);
    expect(delta({ method: 'GET', route: '/files/:id', status_code: '200' })).toBe(1);
    expect(delta({ method: 'DELETE', route: '/files/:id', status_code: '204' })).toBe(1);
    expect(delta({ method: 'GET', route: '/files/:id', status_code: '404' })).toBe(1);
    expect(after).toContain('route="/files/:id"');
    expect(after).not.toContain(id);
    expect(after).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}-/); // ningún UUID en route
  });

  test('las rutas desconocidas se agrupan como route="unmatched", sin la URL', async () => {
    const before = await scrape();

    await request(app).get('/ruta-que-no-existe-12345');
    const after = await scrape();

    expect(value(after, 'http_requests_total', { route: 'unmatched', status_code: '404' }) -
      value(before, 'http_requests_total', { route: 'unmatched', status_code: '404' })).toBe(1);
    expect(after).not.toContain('ruta-que-no-existe-12345');
  });

  test('files_uploaded_total cuenta las subidas correctas y storage_bytes suma size_bytes', async () => {
    const before = await scrape();

    await request(app).post('/files').set(auth()).attach('file', fixtures.png, 'a.png').expect(201);
    await request(app).post('/files').set(auth()).attach('file', fixtures.pdf, 'b.pdf').expect(201);
    await request(app).post('/files').set(auth()).attach('file', fixtures.zip, 'c.zip').expect(415);
    const after = await scrape();

    const uploaded = (labels) => value(after, 'files_uploaded_total', labels) - value(before, 'files_uploaded_total', labels);
    expect(uploaded()).toBe(2);
    expect(uploaded({ mime_type: 'image/png' })).toBe(1);
    const { rows } = await pool.query('SELECT COALESCE(SUM(size_bytes), 0)::bigint AS total FROM files');
    expect(value(after, 'storage_bytes')).toBe(Number(rows[0].total));
    expect(value(after, 'storage_bytes')).toBeGreaterThan(0);
  });

  test('http_errors_total cuenta los 5xx y la duración se registra con el patrón', async () => {
    const before = await scrape();
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('fallo de la base de datos'));

    await request(app).get('/files').set(auth()).expect(500);
    const after = await scrape();

    const labels = { method: 'GET', route: '/files', status_code: '500' };
    expect(value(after, 'http_errors_total', labels) - value(before, 'http_errors_total', labels)).toBe(1);
    expect(value(after, 'http_request_duration_seconds_count', labels) -
      value(before, 'http_request_duration_seconds_count', labels)).toBe(1);
  });

  test('una petición que el cliente corta se cuenta con status_code="aborted"', async () => {
    const labels = { method: 'POST', route: '/files', status_code: 'aborted' };
    const before = value(await scrape(), 'http_requests_total', labels);
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    try {
      // Subida que anuncia 1 MB, envía unos pocos bytes y corta la conexión.
      await new Promise((resolve) => {
        const req = http.request({
          port: server.address().port,
          method: 'POST',
          path: '/files',
          headers: {
            Authorization: `Bearer ${user.token}`,
            'Content-Type': 'multipart/form-data; boundary=corte',
            'Content-Length': 1_000_000,
          },
        });
        req.on('error', () => {}); // esperado: la conexión se corta a propósito
        req.write('--corte\r\nContent-Disposition: form-data; name="file"; filename="a.txt"\r\n\r\nhola');
        setTimeout(() => {
          req.destroy();
          resolve();
        }, 100);
      });

      // El servidor se entera del corte de forma asíncrona: se espera a que aparezca.
      let after = before;
      for (let i = 0; i < 50 && after === before; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        after = value(await scrape(), 'http_requests_total', labels);
      }
      expect(after - before).toBe(1);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  test('si falla el cálculo de storage_bytes, /metrics responde 200, conserva el valor y lo cuenta', async () => {
    const before = await scrape();
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('sin conexión'));

    const res = await getMetrics();

    expect(res.status).toBe(200);
    const errors = (text) => value(text, 'metrics_collect_errors_total', { metric: 'storage_bytes' });
    expect(errors(res.text) - errors(before)).toBe(1);
    expect(value(res.text, 'storage_bytes')).toBe(value(before, 'storage_bytes'));
  });

  test('el token de métricas y los JWT nunca aparecen en la salida', async () => {
    const text = await scrape();

    expect(text).not.toContain(METRICS_TOKEN);
    expect(text).not.toContain(user.token);
  });
});
