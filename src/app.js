'use strict';

const express = require('express');
const helmet = require('helmet');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

app.use(helmet());
app.use(express.json({ limit: '100kb' }));

app.use(routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
