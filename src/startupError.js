'use strict';

const pino = require('pino');

// Si la configuración no es válida todavía no hay logger configurado (depende de ella):
// se escribe con pino a stderr, de forma síncrona para no perder la línea al salir.
// El mensaje de ConfigError nombra las variables pero nunca incluye sus valores.
function exitOnConfigError(err) {
  if (err.name !== 'ConfigError') throw err;
  pino(pino.destination({ dest: 2, sync: true })).fatal(err.message);
  process.exit(1);
}

module.exports = { exitOnConfigError };
