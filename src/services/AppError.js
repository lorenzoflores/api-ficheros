'use strict';

// Error de dominio con código HTTP y código estable para el cliente (SPEC 1.7).
class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

module.exports = AppError;
