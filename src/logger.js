'use strict';

const pino = require('pino');
const { config } = require('./config');

// Lo que nunca debe llegar a los logs. Además, el serializador de peticiones de
// requestLogger no incluye cabeceras ni cuerpo: esto es una segunda barrera.
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'password',
  'token',
  '*.password',
  '*.token',
];
const CENSOR = '[REDACTADO]';

// destination permite a los tests capturar la salida; pretty solo en desarrollo
// (pino-pretty es una devDependency y no está en la imagen de producción).
function buildLogger({ level = config.logLevel, destination, pretty = config.env === 'development' } = {}) {
  const options = { level, redact: { paths: REDACT_PATHS, censor: CENSOR } };
  if (destination) return pino(options, destination);
  if (pretty) {
    options.transport = {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
    };
  }
  return pino(options);
}

const logger = buildLogger();

module.exports = { logger, buildLogger, CENSOR };
