'use strict';

const express = require('express');
const helmet = require('helmet');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');
const { config } = require('./config');

const app = express();

// Antes de cualquier middleware: determina req.ip y req.protocol a partir de X-Forwarded-*.
app.set('trust proxy', config.trustProxy);

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
