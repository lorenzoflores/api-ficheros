'use strict';

const { Pool } = require('pg');
const { config } = require('../config');
const { logger } = require('../logger');

const pool = new Pool({
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 5000,
});

// Un error en un cliente inactivo no debe tumbar el proceso.
pool.on('error', (err) => {
  logger.error({ err }, 'Error inesperado en el pool de PostgreSQL');
});

module.exports = { pool };
