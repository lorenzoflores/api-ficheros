'use strict';

require('dotenv').config({ quiet: true });

const app = require('./app');
const { pool } = require('./db/pool');
const { getSecret } = require('./services/tokenService');

// SPEC 1.8: sin un JWT_SECRET válido el servidor no arranca.
try {
  getSecret();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT) || 3000;

const server = app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
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
