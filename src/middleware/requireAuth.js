'use strict';

const Sentry = require('@sentry/node');
const AppError = require('../services/AppError');
const { verifyAccessToken } = require('../services/tokenService');

const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', 'Falta el token de acceso o no es válido');

// Exige "Authorization: Bearer <token>" y deja el usuario en req.user = { id }.
function requireAuth(req, res, next) {
  const match = /^Bearer ([^\s]+)$/i.exec(req.get('Authorization') ?? '');
  if (!match) return next(unauthorized());

  let payload;
  try {
    payload = verifyAccessToken(match[1]);
  } catch {
    return next(unauthorized());
  }

  if (typeof payload.sub !== 'string' || payload.sub === '') return next(unauthorized());

  req.user = { id: payload.sub };
  // Solo el id: ni email ni IP (sendDefaultPii: false en instrument.js).
  Sentry.setUser({ id: payload.sub });
  return next();
}

module.exports = requireAuth;
