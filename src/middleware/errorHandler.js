'use strict';

const AppError = require('../services/AppError');

// Traduce errores conocidos de body-parser (Express) a errores de la API.
function fromBodyParser(err) {
  if (err.type === 'entity.parse.failed') {
    return new AppError(400, 'VALIDATION_ERROR', 'El cuerpo de la petición no es JSON válido');
  }
  if (err.type === 'entity.too.large') {
    return new AppError(413, 'PAYLOAD_TOO_LARGE', 'El cuerpo de la petición es demasiado grande');
  }
  return null;
}

// Manejador central: siempre responde { error: { code, message } } y nunca expone el stack.
function errorHandler(err, req, res, next) {
  // Si la respuesta ya empezó (p. ej. un fallo a mitad de una descarga) no se puede enviar
  // JSON: se delega en Express, que corta la conexión.
  if (res.headersSent) return next(err);

  const appError = err instanceof AppError ? err : fromBodyParser(err);

  if (!appError) {
    if (process.env.NODE_ENV !== 'test') console.error(err);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Error interno del servidor' },
    });
  }

  return res.status(appError.status).json({
    error: { code: appError.code, message: appError.message },
  });
}

module.exports = errorHandler;
