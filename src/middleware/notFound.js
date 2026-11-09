'use strict';

const AppError = require('../services/AppError');

function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'Recurso no encontrado'));
}

module.exports = notFound;
