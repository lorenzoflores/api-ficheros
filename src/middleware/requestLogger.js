'use strict';

const crypto = require('node:crypto');
const pinoHttp = require('pino-http');
const { logger: defaultLogger } = require('../logger');
const { routePath, UNMATCHED } = require('./routePattern');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Reutiliza el X-Request-Id del cliente solo si es un UUID (no se aceptan valores
// arbitrarios en los logs); si no, genera uno. Siempre se devuelve en la respuesta.
function genReqId(req, res) {
  const incoming = req.headers['x-request-id'];
  const id = typeof incoming === 'string' && UUID_RE.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-Id', id);
  return id;
}

function customLogLevel(req, res, err) {
  if (err || res.statusCode >= 500) return 'error';
  if (res.statusCode >= 400) return 'warn';
  return 'info';
}

// Se calculan al terminar la respuesta, cuando ya se conocen el usuario y la ruta.
// (customProps no sirve: pino-http lo evalúa también al empezar y fijaría valores vacíos).
function finalFields(req) {
  const path = routePath(req);
  return {
    userId: req.user?.id,
    route: path === UNMATCHED ? UNMATCHED : `${req.method} ${path}`,
  };
}

function createRequestLogger(logger = defaultLogger) {
  return pinoHttp({
    logger,
    genReqId,
    customLogLevel,
    // De la petición solo id, método y URL (sin query string: podría llevar datos);
    // nunca cabeceras ni cuerpo. De la respuesta, solo el código.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url.split('?')[0] }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
    customSuccessObject: (req, res, val) => ({ ...val, ...finalFields(req) }),
    customErrorObject: (req, res, err, val) => ({ ...val, ...finalFields(req) }),
  });
}

module.exports = createRequestLogger();
module.exports.createRequestLogger = createRequestLogger;
