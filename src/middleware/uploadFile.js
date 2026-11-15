'use strict';

const multer = require('multer');
const AppError = require('../services/AppError');
const { config } = require('../config');

const FIELD_NAME = 'file';
const MIB = 1024 * 1024;

// 10485760 → "10 MB"; si no es un número exacto de MB, en bytes.
const formatSize = (bytes) => (bytes % MIB === 0 ? `${bytes / MIB} MB` : `${bytes} bytes`);

const multerSingle = multer({
  storage: multer.memoryStorage(),
  defParamCharset: 'utf8', // nombres con tildes o ñ llegan bien
  limits: { fileSize: config.maxFileSizeBytes, files: 1, fields: 10, parts: 20 },
}).single(FIELD_NAME);

function toAppError(err) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return new AppError(413, 'FILE_TOO_LARGE', `El fichero supera el máximo de ${formatSize(config.maxFileSizeBytes)}`);
  }
  if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
    return new AppError(400, 'FILE_REQUIRED', `Envía exactamente un fichero en el campo "${FIELD_NAME}"`);
  }
  // Resto de límites de multer o multipart mal formado (errores de busboy).
  return new AppError(400, 'VALIDATION_ERROR', 'La petición multipart no es válida');
}

// Recibe el fichero en memoria y comprueba tamaño (413) y presencia (400), en ese orden (SPEC 1.6).
// El tipo (415) lo decide el servicio a partir del contenido.
function uploadFile(req, res, next) {
  multerSingle(req, res, (err) => {
    if (err) return next(toAppError(err));
    if (!req.file || req.file.size === 0) {
      return next(new AppError(400, 'FILE_REQUIRED', `Falta el fichero en el campo "${FIELD_NAME}" o está vacío`));
    }
    return next();
  });
}

module.exports = uploadFile;
