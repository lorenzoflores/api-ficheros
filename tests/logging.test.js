'use strict';

const { Writable } = require('node:stream');
const request = require('supertest');
const app = require('../src/app');
const { pool, resetDb } = require('./helpers/db');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

afterAll(() => pool.end());

describe('X-Request-Id', () => {
  test('cada respuesta lleva un X-Request-Id UUID distinto', async () => {
    const a = await request(app).get('/health');
    const b = await request(app).get('/health');

    expect(a.headers['x-request-id']).toMatch(UUID_RE);
    expect(b.headers['x-request-id']).toMatch(UUID_RE);
    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  test('reutiliza el X-Request-Id del cliente si es un UUID válido', async () => {
    const id = '3f6c2a1e-8b7d-4c2a-9e1f-2b3c4d5e6f70';

    const res = await request(app).get('/health').set('X-Request-Id', id);

    expect(res.headers['x-request-id']).toBe(id);
  });

  test.each([
    ['un texto cualquiera', 'mi-peticion-123'],
    ['un intento de inyección', 'abc\\n{"level":60}'],
    ['un UUID con texto añadido', '3f6c2a1e-8b7d-4c2a-9e1f-2b3c4d5e6f70-extra'],
  ])('ignora %s y genera un UUID nuevo', async (_caso, value) => {
    const res = await request(app).get('/health').set('X-Request-Id', value);

    expect(res.headers['x-request-id']).toMatch(UUID_RE);
    expect(res.headers['x-request-id']).not.toBe(value);
  });

  test('también se devuelve en los errores (404 y 401)', async () => {
    const notFound = await request(app).get('/no-existe');
    const unauthorized = await request(app).get('/files');

    expect(notFound.headers['x-request-id']).toMatch(UUID_RE);
    expect(unauthorized.headers['x-request-id']).toMatch(UUID_RE);
  });
});

// Logger real (mismas opciones de redact) con la salida en memoria.
function captureLogger() {
  const lines = [];
  const destination = new Writable({
    write(chunk, _enc, cb) {
      lines.push(...chunk.toString().split('\n').filter(Boolean));
      cb();
    },
  });
  const { buildLogger } = jest.requireActual('../src/logger');
  return { logger: buildLogger({ level: 'info', destination }), lines };
}

describe('Redacción del logger', () => {
  test('nunca escribe Authorization, cookies, contraseñas ni tokens', () => {
    const { logger, lines } = captureLogger();

    logger.info({
      req: { headers: { authorization: 'Bearer token-secreto', cookie: 'sid=cookie-secreta' } },
      password: 'clave-secreta',
      token: 'jwt-secreto',
      body: { password: 'otra-clave', token: 'otro-jwt' },
    });

    const out = lines.join('\n');
    expect(out).toContain('[REDACTADO]');
    for (const secret of ['token-secreto', 'cookie-secreta', 'clave-secreta', 'jwt-secreto', 'otra-clave', 'otro-jwt']) {
      expect(out).not.toContain(secret);
    }
  });
});

describe('Logs de peticiones (requestLogger)', () => {
  // App aislada cuyo requestLogger escribe en memoria.
  let logApp;
  let logPool;
  let lines;
  const parsed = () => lines.map((l) => JSON.parse(l));
  const lastFor = (reqId) => parsed().findLast((l) => l.req?.id === reqId);

  beforeAll(async () => {
    await resetDb();
    const capture = captureLogger();
    lines = capture.lines;
    jest.isolateModules(() => {
      jest.doMock('../src/logger', () => ({ ...jest.requireActual('../src/logger'), logger: capture.logger }));
      logApp = require('../src/app');
      logPool = require('../src/db/pool').pool;
    });
    jest.dontMock('../src/logger');
  });

  afterAll(() => logPool.end());
  beforeEach(() => lines.splice(0));

  test('registra solo id, método y URL de la petición, y añade route con el patrón y userId', async () => {
    const credentials = { email: 'log@example.com', password: 'clave-que-no-debe-salir' };
    const reg = await request(logApp).post('/auth/register').send(credentials);
    const { token } = (await request(logApp).post('/auth/login').send(credentials)).body;
    const up = await request(logApp)
      .post('/files')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('contenido-privado-del-fichero\n'), 'notas.txt');

    const res = await request(logApp).delete(`/files/${up.body.id}`).set('Authorization', `Bearer ${token}`);

    const line = lastFor(res.headers['x-request-id']);
    expect(line.level).toBe(30); // info
    expect(line.req).toEqual({ id: res.headers['x-request-id'], method: 'DELETE', url: `/files/${up.body.id}` });
    expect(line.route).toBe('DELETE /files/:id');
    expect(line.userId).toBe(reg.body.id);
    expect(line.res).toEqual({ statusCode: 204 });

    // Nada sensible en ninguna línea: contraseña, token, cabecera Authorization ni contenido.
    const all = lines.join('\n');
    expect(all).not.toContain(credentials.password);
    expect(all).not.toContain(token);
    expect(all).not.toMatch(/bearer/i);
    expect(all).not.toContain('contenido-privado-del-fichero');
  });

  test('conserva el patrón completo cuando la ruta termina en error (404 de un fichero inexistente)', async () => {
    const credentials = { email: 'log404@example.com', password: 'secreta123' };
    await request(logApp).post('/auth/register').send(credentials);
    const { token } = (await request(logApp).post('/auth/login').send(credentials)).body;
    const fileId = '00000000-0000-4000-8000-000000000000';

    const res = await request(logApp).get(`/files/${fileId}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
    const line = lastFor(res.headers['x-request-id']);
    expect(line.route).toBe('GET /files/:id'); // no "/:id": Express restaura baseUrl al propagar el error
    expect(line.level).toBe(40);
  });

  test('las peticiones sin ruta se registran como "unmatched", nunca con un patrón inventado', async () => {
    const res = await request(logApp).get('/no-existe');

    expect(lastFor(res.headers['x-request-id']).route).toBe('unmatched');
  });

  test('nivel warn para 4xx y error para 5xx', async () => {
    const unauthorized = await request(logApp).get('/files');
    jest.spyOn(logPool, 'query').mockRejectedValueOnce(new Error('sin conexión'));
    const unavailable = await request(logApp).get('/health');

    expect(unauthorized.status).toBe(401);
    expect(lastFor(unauthorized.headers['x-request-id']).level).toBe(40); // warn
    expect(unavailable.status).toBe(503);
    expect(lastFor(unavailable.headers['x-request-id']).level).toBe(50); // error
  });
});
