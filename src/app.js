'use strict';

const Sentry = require('@sentry/node');
const express = require('express');
const helmet = require('helmet');
const routes = require('./routes');
const requestLogger = require('./middleware/requestLogger');
const { metricsMiddleware } = require('./metrics');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { config } = require('./config');

const app = express();

// Antes de cualquier middleware: determina req.ip y req.protocol a partir de X-Forwarded-*.
app.set('trust proxy', config.trustProxy);

// El primero: asigna req.id (X-Request-Id) y registra todas las peticiones, también las
// que rechace cualquier middleware posterior.
app.use(requestLogger);

// Cada error enviado a Sentry lleva el mismo id que la línea de log y la cabecera X-Request-Id.
app.use((req, res, next) => {
  Sentry.setTag('reqId', req.id);
  next();
});

// Métricas HTTP de todas las peticiones (también las rechazadas por middlewares posteriores).
app.use(metricsMiddleware);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.use(routes);

app.use(notFound);

// Envía a Sentry los errores 5xx y los no controlados (ignora los que tienen status 3xx/4xx,
// como nuestros AppError de validación o 404). Después responde nuestro errorHandler.
Sentry.setupExpressErrorHandler(app);
app.use(errorHandler);

module.exports = app;
