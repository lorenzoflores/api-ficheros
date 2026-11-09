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

// Los ficheros subidos en los tests van a una carpeta temporal, nunca a ./uploads.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'api-ficheros-tests');
