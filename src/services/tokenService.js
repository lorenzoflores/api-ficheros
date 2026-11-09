'use strict';

const jwt = require('jsonwebtoken');

const ALGORITHM = 'HS256';
const EXPIRES_IN_SECONDS = 60 * 60; // 1 hora (SPEC 1.3)
const MIN_SECRET_LENGTH = 32;

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`JWT_SECRET debe existir y tener al menos ${MIN_SECRET_LENGTH} caracteres`);
  }
  return secret;
}

function signAccessToken(userId) {
  return jwt.sign({}, getSecret(), {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: EXPIRES_IN_SECONDS,
  });
}

// Devuelve el payload o lanza si el token no es válido (firma, formato, caducidad, algoritmo).
function verifyAccessToken(token) {
  return jwt.verify(token, getSecret(), { algorithms: [ALGORITHM] });
}

module.exports = { signAccessToken, verifyAccessToken, getSecret, EXPIRES_IN_SECONDS };
