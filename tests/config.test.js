'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig, ConfigError } = require('../src/config');

const VALID = {
  DATABASE_URL: 'postgres://usuario:clave@localhost:5432/bd',
  JWT_SECRET: 'a'.repeat(32),
};

const issuesOf = (env) => {
  try {
    loadConfig(env);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err.issues;
  }
  throw new Error('loadConfig no lanzó ConfigError');
};

describe('loadConfig', () => {
  test('con solo las obligatorias aplica los valores por defecto de SPEC.md', () => {
    const config = loadConfig(VALID);

    expect(config).toEqual({
      env: 'development',
      port: 3000,
      databaseUrl: VALID.DATABASE_URL,
      jwt: { secret: VALID.JWT_SECRET, expiresInSeconds: 3600 },
      uploadDir: path.resolve(__dirname, '..', 'uploads'),
      maxFileSizeBytes: 10485760,
    });
    expect(Object.isFrozen(config)).toBe(true);
  });

  test('lee y convierte todas las variables', () => {
    const config = loadConfig({
      ...VALID,
      PORT: '8080',
      JWT_EXPIRES_IN: '15m',
      UPLOAD_DIR: '/var/datos',
      MAX_FILE_SIZE_BYTES: '5242880',
    });

    expect(config.port).toBe(8080);
    expect(config.jwt.expiresInSeconds).toBe(900);
    expect(config.uploadDir).toBe('/var/datos');
    expect(config.maxFileSizeBytes).toBe(5242880);
  });

  test.each([
    ['3600', 3600],
    ['90s', 90],
    ['2h', 7200],
    ['1d', 86400],
  ])('JWT_EXPIRES_IN=%s equivale a %i segundos', (value, seconds) => {
    expect(loadConfig({ ...VALID, JWT_EXPIRES_IN: value }).jwt.expiresInSeconds).toBe(seconds);
  });

  test('una variable vacía cuenta como ausente', () => {
    expect(loadConfig({ ...VALID, PORT: '', JWT_EXPIRES_IN: '' }).port).toBe(3000);
    expect(issuesOf({ ...VALID, JWT_SECRET: '' })).toEqual(['JWT_SECRET: es obligatoria']);
  });

  test('sin DATABASE_URL ni JWT_SECRET falla nombrando ambas', () => {
    expect(issuesOf({})).toEqual(['DATABASE_URL: es obligatoria', 'JWT_SECRET: es obligatoria']);
  });

  test('JWT_SECRET de 31 caracteres falla; de 32 es válido', () => {
    expect(issuesOf({ ...VALID, JWT_SECRET: 'a'.repeat(31) })).toEqual([
      'JWT_SECRET: debe tener al menos 32 caracteres',
    ]);
    expect(() => loadConfig({ ...VALID, JWT_SECRET: 'a'.repeat(32) })).not.toThrow();
  });

  test.each([
    ['DATABASE_URL', 'http://localhost/bd'],
    ['DATABASE_URL', 'no es una url'],
    ['PORT', 'abc'],
    ['PORT', '70000'],
    ['JWT_EXPIRES_IN', '1y'],
    ['JWT_EXPIRES_IN', '0'],
    ['MAX_FILE_SIZE_BYTES', '0'],
    ['MAX_FILE_SIZE_BYTES', '1.5'],
    ['MAX_FILE_SIZE_BYTES', '3000000000'],
    ['NODE_ENV', 'staging'],
  ])('%s=%s no es válido', (key, value) => {
    const issues = issuesOf({ ...VALID, [key]: value });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(new RegExp(`^${key}: `));
  });

  test('el mensaje de error nunca incluye el valor de la variable', () => {
    const secret = 'secreto-corto-que-no-debe-salir';

    try {
      loadConfig({ ...VALID, JWT_SECRET: secret });
    } catch (err) {
      expect(err.message).not.toContain(secret);
      return;
    }
    throw new Error('debía fallar');
  });
});

describe('arranque con configuración inválida', () => {
  // Se ejecuta en una carpeta vacía y con un entorno mínimo: sin .env ni variables heredadas.
  const run = (script, env) => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'api-ficheros-config-'));
    try {
      return spawnSync(process.execPath, [path.join(__dirname, '..', script)], {
        cwd,
        env: { PATH: process.env.PATH, ...env },
        encoding: 'utf8',
        timeout: 10000,
      });
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  };

  test('el servidor no arranca sin las variables obligatorias (código 1)', () => {
    const result = run('src/server.js', {});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL: es obligatoria');
    expect(result.stderr).toContain('JWT_SECRET: es obligatoria');
    expect(result.stdout).not.toContain('API escuchando');
  });

  test('el servidor no arranca con un JWT_SECRET corto y no lo muestra', () => {
    const result = run('src/server.js', { ...VALID, JWT_SECRET: 'secreto-corto' });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET: debe tener al menos 32 caracteres');
    expect(result.stderr).not.toContain('secreto-corto');
  });

  test('las migraciones tampoco se ejecutan sin configuración válida', () => {
    const result = run('src/db/migrate.js', {});

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Configuración inválida');
  });
});
