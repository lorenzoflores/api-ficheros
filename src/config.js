'use strict';

const path = require('node:path');
const { z } = require('zod');

const PROJECT_ROOT = path.join(__dirname, '..');
const PG_INTEGER_MAX = 2_147_483_647; // files.size_bytes es INTEGER
const DURATION_UNITS = { s: 1, m: 60, h: 3600, d: 86400 };

class ConfigError extends Error {
  constructor(issues) {
    super(`Configuración inválida:\n${issues.map((i) => `  - ${i}`).join('\n')}`);
    this.name = 'ConfigError';
    this.issues = issues;
  }
}

// Las variables vacías ("PORT=") cuentan como ausentes, para que se aplique el valor por defecto
// o salte el error de obligatoria en lugar de un error de formato confuso.
const optional = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema);

// "3600" (segundos), "90s", "15m", "1h" o "7d" → segundos.
const duration = z
  .string()
  .regex(/^\d+[smhd]?$/, { error: 'debe ser un número de segundos o terminar en s, m, h o d (p. ej. 1h)' })
  .transform((value) => {
    const unit = /[smhd]$/.test(value) ? value.at(-1) : 's';
    return Number.parseInt(value, 10) * DURATION_UNITS[unit];
  })
  .pipe(z.number().int().positive({ error: 'debe ser mayor que 0' }));

const envSchema = z.object({
  NODE_ENV: optional(z.enum(['development', 'production', 'test']).default('development')),
  PORT: optional(
    z.coerce
      .number({ error: 'debe ser un número de puerto' })
      .int({ error: 'debe ser un número de puerto' })
      .min(1, { error: 'debe estar entre 1 y 65535' })
      .max(65535, { error: 'debe estar entre 1 y 65535' })
      .default(3000),
  ),
  DATABASE_URL: optional(
    z.url({
      protocol: /^postgres(ql)?$/,
      error: (issue) =>
        issue.input === undefined ? 'es obligatoria' : 'debe ser una URL postgres://usuario:clave@host:puerto/bd',
    }),
  ),
  JWT_SECRET: optional(
    z
      .string({ error: 'es obligatoria' })
      .min(32, { error: 'debe tener al menos 32 caracteres' }),
  ),
  // prefault (no default): el valor por defecto también pasa por la transformación a segundos.
  JWT_EXPIRES_IN: optional(duration.prefault('1h')),
  UPLOAD_DIR: optional(z.string().default('./uploads')),
  MAX_FILE_SIZE_BYTES: optional(
    z.coerce
      .number({ error: 'debe ser un número entero de bytes' })
      .int({ error: 'debe ser un número entero de bytes' })
      .positive({ error: 'debe ser mayor que 0' })
      .max(PG_INTEGER_MAX, { error: `no puede superar ${PG_INTEGER_MAX}` })
      .default(10 * 1024 * 1024),
  ),
});

// Función pura: valida un objeto de entorno y devuelve la configuración tipada.
// Los mensajes de error nombran la variable pero nunca incluyen su valor (podría ser un secreto).
function loadConfig(env) {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
  }
  const e = result.data;
  return Object.freeze({
    env: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    jwt: Object.freeze({ secret: e.JWT_SECRET, expiresInSeconds: e.JWT_EXPIRES_IN }),
    // Las rutas relativas se resuelven desde la raíz del proyecto, no desde el directorio actual.
    uploadDir: path.resolve(PROJECT_ROOT, e.UPLOAD_DIR),
    maxFileSizeBytes: e.MAX_FILE_SIZE_BYTES,
  });
}

// .env no sobrescribe variables ya definidas en el entorno real.
require('dotenv').config({ quiet: true });

const config = loadConfig(process.env);

module.exports = { config, loadConfig, ConfigError };
