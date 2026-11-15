'use strict';

const jwt = require('jsonwebtoken');
const { config } = require('../config');

const ALGORITHM = 'HS256';

function signAccessToken(userId) {
  return jwt.sign({}, config.jwt.secret, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: config.jwt.expiresInSeconds,
  });
}

// Devuelve el payload o lanza si el token no es válido (firma, formato, caducidad, algoritmo).
function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.secret, { algorithms: [ALGORITHM] });
}

module.exports = { signAccessToken, verifyAccessToken };
