'use strict';

require('./instrument'); // Sentry: tiene que ir antes que cualquier otro módulo.

// La configuración se valida al cargarla: si falta una variable obligatoria o
// JWT_SECRET es demasiado corto, el servidor no arranca (SPEC 1.8).
const { exitOnConfigError } = require('./startupError');

let config;
try {
  ({ config } = require('./config'));
} catch (err) {
  exitOnConfigError(err);
}

const app = require('./app');
const { pool } = require('./db/pool');
const { logger } = require('./logger');

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'API escuchando');
});

function shutdown(signal) {
  logger.info({ signal }, 'Señal recibida, cerrando...');
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
