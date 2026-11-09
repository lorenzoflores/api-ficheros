'use strict';

const { Pool } = require('pg');

const DEFAULT_TEST_DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/ficheros_test';

// Los tests (NODE_ENV=test, lo fija Jest) nunca tocan la base de datos de desarrollo.
function getDatabaseUrl() {
  if (process.env.NODE_ENV === 'test') {
    return process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL;
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('Falta la variable de entorno DATABASE_URL');
  }
  return process.env.DATABASE_URL;
}

const pool = new Pool({
  connectionString: getDatabaseUrl(),
  connectionTimeoutMillis: 5000,
});

// Un error en un cliente inactivo no debe tumbar el proceso.
pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = { pool, getDatabaseUrl };
