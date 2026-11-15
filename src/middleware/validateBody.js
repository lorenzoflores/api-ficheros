'use strict';

const AppError = require('../services/AppError');

// Valida req.body con un esquema zod y lo sustituye por los datos ya normalizados.
function validateBody(schema) {
  return (req, res, next) => {
    if (req.body === null || typeof req.body !== 'object' || Array.isArray(req.body)) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'El cuerpo debe ser un objeto JSON'));
    }
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(new AppError(400, 'VALIDATION_ERROR', result.error.issues[0].message));
    }
    req.body = result.data;
    return next();
  };
}

module.exports = validateBody;
