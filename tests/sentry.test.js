'use strict';

const crypto = require('node:crypto');
const request = require('supertest');
const { beforeSend, sentryOptions } = require('../src/instrument');
const { config } = require('../src/config');
const { pool: sharedPool, resetDb } = require('./helpers/db');

// Formato real de DSN (la clave no admite guiones); el host no existe y nada sale a la red.
// resetDb usa el pool compartido de los tests: hay que cerrarlo o Jest tarda en salir.
afterAll(() => sharedPool.end());

const DSN = 'https://abc123@sentry.example.invalid/1';

describe('beforeSend', () => {
  test('quita IP, cuerpo, cookies, query string y cabeceras sensibles; conserva el resto', () => {
    const event = beforeSend({
      user: { id: 'u-1', ip_address: '203.0.113.7' },
      tags: { reqId: 'r-1' },
      request: {
        method: 'POST',
        url: 'https://api.example.com/auth/login',
        data: '{"email":"ana@example.com","password":"clave-secreta"}',
        cookies: { sid: 'cookie-secreta' },
        query_string: 'token=jwt-secreto',
        env: { REMOTE_ADDR: '203.0.113.7' },
        headers: {
          Authorization: 'Bearer jwt-secreto',
          cookie: 'sid=cookie-secreta',
          'X-Forwarded-For': '203.0.113.7',
          'user-agent': 'curl/8',
        },
      },
    });

    expect(event.user).toEqual({ id: 'u-1' });
    expect(event.tags).toEqual({ reqId: 'r-1' });
    expect(event.request).toEqual({
      method: 'POST',
      url: 'https://api.example.com/auth/login',
      headers: { 'user-agent': 'curl/8' },
    });
    expect(JSON.stringify(event)).not.toMatch(/clave-secreta|cookie-secreta|jwt-secreto|203\.0\.113\.7/);
  });

  test('acepta eventos sin user ni request', () => {
    expect(beforeSend({ message: 'x' })).toEqual({ message: 'x' });
  });
});

describe('Inicialización (instrument.js)', () => {
  const loadInstrumentWith = (env) => {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    const init = jest.fn();
    try {
      jest.isolateModules(() => {
        jest.doMock('@sentry/node', () => ({ init }));
        require('../src/instrument');
      });
    } finally {
      jest.dontMock('@sentry/node');
      process.env = saved;
    }
    return init;
  };

  test('sin SENTRY_DSN no inicializa Sentry: no se envía nada', () => {
    expect(loadInstrumentWith({ SENTRY_DSN: '' })).not.toHaveBeenCalled();
  });

  test('con SENTRY_TRACES_SAMPLE_RATE envía esa fracción de trazas', () => {
    const init = loadInstrumentWith({ SENTRY_DSN: DSN, SENTRY_TRACES_SAMPLE_RATE: '0.25' });

    expect(init.mock.calls[0][0].tracesSampleRate).toBe(0.25);
  });

  test('con SENTRY_DSN inicializa sin PII, sin trazas y con release <name>@<version>', () => {
    const init = loadInstrumentWith({ SENTRY_DSN: DSN, SENTRY_ENVIRONMENT: 'staging' });

    expect(init).toHaveBeenCalledTimes(1);
    // beforeSend es otra instancia de la función (registro de módulos aislado): basta con que exista.
    expect(init.mock.calls[0][0]).toEqual({
      dsn: DSN,
      environment: 'staging',
      release: config.release,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      includeLocalVariables: false,
      beforeSend: expect.any(Function),
    });
    expect(config.release).toMatch(/^api-ficheros@\d+\.\d+\.\d+/);
  });
});

describe('Errores capturados desde la app', () => {
  // App aislada con un cliente de Sentry real (opciones de instrument.js, beforeSend incluido)
  // y un transporte que guarda los envelopes en memoria: se comprueba exactamente lo que
  // se enviaría por la red, sin enviar nada.
  let app;
  let pool;
  let Sentry;
  const sent = []; // cuerpos de los envelopes, tal cual saldrían
  const events = () =>
    sent.flatMap((body) => {
      const lines = (typeof body === 'string' ? body : Buffer.from(body).toString('utf8')).split('\n');
      const out = [];
      for (let i = 1; i < lines.length - 1; i += 2) {
        if (JSON.parse(lines[i]).type === 'event') out.push(JSON.parse(lines[i + 1]));
      }
      return out;
    });

  beforeAll(async () => {
    await resetDb();
    // En Jest el SDK no puede registrar sus hooks de carga de módulos y lo avisa por consola:
    // es propio del entorno de tests y no afecta a lo que se comprueba aquí.
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.isolateModules(() => {
      Sentry = require('@sentry/node');
      Sentry.init({
        ...sentryOptions({ ...config, sentry: { dsn: DSN, environment: 'test' } }),
        transport: (options) =>
          Sentry.createTransport(options, async (req) => {
            sent.push(req.body);
            return { statusCode: 200 };
          }),
      });
      app = require('../src/app');
      pool = require('../src/db/pool').pool;
    });
    warn.mockRestore();
  });

  afterAll(async () => {
    await Sentry.close();
    await pool.end();
  });

  beforeEach(() => sent.splice(0));

  test('un 500 se envía con el reqId de la petición y solo el id del usuario', async () => {
    // Contraseña generada en ejecución: si apareciera en el envelope sería una fuga real, no el
    // código fuente del test (Sentry adjunta líneas de código alrededor de cada frame).
    const credentials = { email: 'sentry@example.com', password: `clave-${crypto.randomUUID()}` };
    const reg = await request(app).post('/auth/register').send(credentials);
    const { token } = (await request(app).post('/auth/login').send(credentials)).body;
    jest.spyOn(pool, 'query').mockRejectedValueOnce(new Error('fallo inesperado de la base de datos'));

    const res = await request(app).get('/files').set('Authorization', `Bearer ${token}`);
    await Sentry.flush(2000);

    expect(res.status).toBe(500);
    const [event] = events();
    expect(events()).toHaveLength(1);
    expect(event.tags.reqId).toBe(res.headers['x-request-id']);
    expect(event.user).toEqual({ id: reg.body.id });
    // Ni la contraseña ni el token aparecen en nada de lo que se enviaría.
    const raw = sent.map((b) => (typeof b === 'string' ? b : Buffer.from(b).toString('utf8'))).join('\n');
    expect(raw).not.toContain(credentials.password);
    expect(raw).not.toContain(token);
    expect(raw).not.toMatch(/"vars":/); // sin variables locales en los frames
  });

  test('los errores 4xx no se envían', async () => {
    await request(app).get('/files'); // 401
    await request(app).get('/no-existe'); // 404
    await request(app).post('/auth/login').send({}); // 400
    await Sentry.flush(2000);

    expect(events()).toHaveLength(0);
  });
});
