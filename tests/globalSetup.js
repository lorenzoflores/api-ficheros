'use strict';

// Aplica las migraciones a la base de datos de tests antes de ejecutar la suite.
module.exports = async () => {
  require('dotenv').config({ quiet: true });
  const { pool } = require('../src/db/pool');
  const { migrate } = require('../src/db/migrate');

  try {
    await migrate(pool, { log: () => {} });
  } finally {
    await pool.end();
  }
};
