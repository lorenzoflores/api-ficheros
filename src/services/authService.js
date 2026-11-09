'use strict';

const bcrypt = require('bcrypt');
const { pool } = require('../db/pool');
const AppError = require('./AppError');
const tokenService = require('./tokenService');

// Coste de bcrypt: 12 en ejecución real; 4 (el mínimo) en tests para que sean rápidos.
const SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 4 : 12;
const PG_UNIQUE_VIOLATION = '23505';

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos');

// Hash de relleno: si el email no existe se compara igualmente contra él, para que
// el tiempo de respuesta no revele qué emails están registrados.
let dummyHashPromise;
function getDummyHash() {
  dummyHashPromise ??= bcrypt.hash('contraseña-de-relleno', SALT_ROUNDS);
  return dummyHashPromise;
}

async function register(email, password) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
      [email, passwordHash],
    );
    return rows[0];
  } catch (err) {
    // La unicidad la garantiza el índice sobre lower(email), también ante registros simultáneos.
    if (err.code === PG_UNIQUE_VIOLATION) {
      throw new AppError(409, 'EMAIL_ALREADY_EXISTS', 'Ya existe un usuario con ese email');
    }
    throw err;
  }
}

async function login(email, password) {
  const { rows } = await pool.query(
    'SELECT id, password_hash FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const user = rows[0];
  const hash = user ? user.password_hash : await getDummyHash();
  const passwordMatches = await bcrypt.compare(password, hash);

  if (!user || !passwordMatches) throw invalidCredentials();

  return { token: tokenService.signAccessToken(user.id) };
}

module.exports = { register, login };
