'use strict';

const { pool } = require('../db/pool');
const AppError = require('./AppError');

async function checkHealth() {
  try {
    await pool.query('SELECT 1');
  } catch {
    throw new AppError(503, 'SERVICE_UNAVAILABLE', 'La base de datos no está disponible');
  }
  return { status: 'ok' };
}

module.exports = { checkHealth };
