'use strict';

const crypto = require('node:crypto');
const AppError = require('../services/AppError');
const { config } = require('../config');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest();

// Comparación en tiempo constante. Se comparan los hashes (misma longitud siempre):
// timingSafeEqual exige longitudes iguales, y comprobarlas antes revelaría la del token.
function tokenMatches(received, expected) {
  return crypto.timingSafeEqual(sha256(received), sha256(expected));
}

// GET /metrics exige "Authorization: Bearer <METRICS_TOKEN>".
// Sin METRICS_TOKEN configurado el endpoint no existe (404), igual que una ruta desconocida.
function requireMetricsToken(req, res, next) {
  if (!config.metricsToken) {
    return next(new AppError(404, 'NOT_FOUND', 'Recurso no encontrado'));
  }
  const match = /^Bearer (\S+)$/i.exec(req.get('Authorization') ?? '');
  if (!match || !tokenMatches(match[1], config.metricsToken)) {
    return next(new AppError(401, 'UNAUTHORIZED', 'Falta el token de métricas o no es válido'));
  }
  return next();
}

module.exports = requireMetricsToken;
