'use strict';

// La configuración se valida al cargarla: si falta una variable obligatoria o
// JWT_SECRET es demasiado corto, el servidor no arranca (SPEC 1.8).
let config;
try {
  ({ config } = require('./config'));
} catch (err) {
  if (err.name !== 'ConfigError') throw err;
  console.error(err.message);
  process.exit(1);
}

const app = require('./app');
const { pool } = require('./db/pool');

const server = app.listen(config.port, () => {
  console.log(`API escuchando en http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal} recibido, cerrando...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
