'use strict';

const crypto = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

// Entorno de los tests. Se ejecuta antes de cargar src/config.js, que valida estas variables.
require('dotenv').config({ quiet: true }); // por si TEST_DATABASE_URL está en .env

// Los tests nunca usan la base de datos de desarrollo, aunque .env defina DATABASE_URL.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/ficheros_test';

// Secreto aleatorio en cada ejecución: no hay ningún secreto escrito en el código.
process.env.JWT_SECRET = crypto.randomBytes(48).toString('base64');

// Valores de SPEC.md, fijados para que un .env local no altere los tests.
process.env.JWT_EXPIRES_IN = '1h';
process.env.MAX_FILE_SIZE_BYTES = String(10 * 1024 * 1024);

// Sin logs en la salida de los tests aunque .env defina LOG_LEVEL. Los tests de logging
// crean su propio logger con un destino en memoria.
process.env.LOG_LEVEL = 'silent';

// Los tests nunca envían nada a Sentry, aunque .env defina SENTRY_DSN.
process.env.SENTRY_DSN = '';

// Token de /metrics aleatorio en cada ejecución (los tests lo leen de process.env).
process.env.METRICS_TOKEN = crypto.randomBytes(24).toString('base64url');

// Los ficheros subidos en los tests van a una carpeta temporal, nunca a ./uploads.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'api-ficheros-tests');
