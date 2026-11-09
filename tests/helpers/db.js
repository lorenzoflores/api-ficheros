'use strict';

const fs = require('node:fs/promises');
const { config } = require('../../src/config');
const { pool } = require('../../src/db/pool');

// Deja la base de datos de tests y la carpeta de subidas vacías.
async function resetDb() {
  await pool.query('TRUNCATE users CASCADE'); // arrastra también la tabla files
  await fs.rm(config.uploadDir, { recursive: true, force: true });
}

module.exports = { pool, resetDb };
