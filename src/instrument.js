'use strict';

// Se carga en la primera línea de server.js, antes que express, http o pg: Sentry
// instrumenta esos módulos al cargarlos y así aísla el contexto (usuario, reqId) de
// cada petición. Sin SENTRY_DSN no se inicializa y no se envía nada.
const Sentry = require('@sentry/node');

const SENSITIVE_HEADERS = /^(authorization|cookie|x-forwarded-for|x-real-ip|forwarded)$/i;

// Última barrera antes de enviar un evento: quita la IP y todo lo que pueda llevar
// credenciales o datos del usuario, sin depender de los valores por defecto del SDK.
function beforeSend(event) {
  if (event.user) delete event.user.ip_address;
  const req = event.request;
  if (req) {
    delete req.data; // cuerpo: en el login lleva la contraseña
    delete req.cookies;
    delete req.query_string;
    delete req.env; // REMOTE_ADDR
    if (req.headers) {
      for (const name of Object.keys(req.headers)) {
        if (SENSITIVE_HEADERS.test(name)) delete req.headers[name];
      }
    }
  }
  return event;
}

function sentryOptions(config) {
  return {
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    release: config.release,
    sendDefaultPii: false,
    tracesSampleRate: 0, // solo errores, sin trazas de rendimiento
    // Nunca adjuntar valores de variables locales: en authService.login una de ellas es la contraseña.
    // Ya es el valor por defecto; se fija para no depender de él.
    includeLocalVariables: false,
    beforeSend,
  };
}

let config = null;
try {
  ({ config } = require('./config'));
} catch (err) {
  // Configuración inválida: server.js lo notifica y termina; Sentry no se inicializa.
  // Cualquier otro error (módulo ausente, error de sintaxis...) no se oculta.
  if (err.name !== 'ConfigError') throw err;
}

if (config?.sentry.dsn) {
  Sentry.init(sentryOptions(config));
}

module.exports = { beforeSend, sentryOptions };
