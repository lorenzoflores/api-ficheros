'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pool } = require('../db/pool');
const { config } = require('../config');
const AppError = require('./AppError');
const { detectMimeType } = require('./fileTypeService');

const PG_FOREIGN_KEY_VIOLATION = '23503';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_NAME_LENGTH = 255;

const notFound = () => new AppError(404, 'NOT_FOUND', 'Recurso no encontrado');

// En disco el fichero se llama como su id (un UUID validado): el nombre original nunca forma la ruta.
function diskPath(id) {
  return path.join(config.uploadDir, id);
}

// El nombre original es solo metadato, pero se limpia: sin rutas, sin caracteres de control.
function sanitizeName(originalName) {
  const base = String(originalName ?? '').split(/[/\\]/).pop();
  // eslint-disable-next-line no-control-regex -- se eliminan caracteres de control.
  const clean = base.replace(/[\u0000-\u001F\u007F-\u009F]/g, '').trim().slice(0, MAX_NAME_LENGTH);
  return clean || 'fichero';
}

function toDto(row) {
  return {
    id: row.id,
    name: row.original_name,
    size: row.size_bytes,
    mimeType: row.mime_type,
    createdAt: row.created_at.toISOString(),
  };
}

async function upload(userId, file) {
  const mimeType = detectMimeType(file.buffer);
  if (!mimeType) {
    throw new AppError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Tipo de fichero no permitido: solo PNG, JPEG, PDF o texto plano',
    );
  }

  const id = crypto.randomUUID();
  const target = diskPath(id);

  // Primero los bytes y después los metadatos: si algo falla a medias, como mucho queda un
  // fichero huérfano en disco (inaccesible), nunca una fila que apunte a un fichero inexistente.
  await fs.mkdir(config.uploadDir, { recursive: true });
  await fs.writeFile(target, file.buffer, { flag: 'wx' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO files (id, user_id, original_name, mime_type, size_bytes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, original_name, mime_type, size_bytes, created_at`,
      [id, userId, sanitizeName(file.originalname), mimeType, file.size],
    );
    return toDto(rows[0]);
  } catch (err) {
    await fs.rm(target, { force: true });
    // Token válido de un usuario que ya no existe.
    if (err.code === PG_FOREIGN_KEY_VIOLATION) {
      throw new AppError(401, 'UNAUTHORIZED', 'Falta el token de acceso o no es válido');
    }
    throw err;
  }
}

async function list(userId) {
  const { rows } = await pool.query(
    `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
      WHERE user_id = $1
      ORDER BY created_at DESC, id DESC`,
    [userId],
  );
  return rows.map(toDto);
}

// Fichero ajeno, inexistente o id mal formado: siempre el mismo 404 (SPEC 1.5).
async function findOwned(userId, fileId) {
  if (!UUID_RE.test(fileId)) throw notFound();
  const { rows } = await pool.query(
    `SELECT id, original_name, mime_type, size_bytes, created_at
       FROM files
      WHERE id = $1 AND user_id = $2`,
    [fileId, userId],
  );
  if (rows.length === 0) throw notFound();
  return rows[0];
}

// Devuelve los metadatos y un handle abierto; quien lo recibe debe cerrarlo (lo hace el stream).
async function openForDownload(userId, fileId) {
  const row = await findOwned(userId, fileId);
  const handle = await fs.open(diskPath(row.id), 'r');
  return { file: toDto(row), handle };
}

async function remove(userId, fileId) {
  if (!UUID_RE.test(fileId)) throw notFound();
  const { rows } = await pool.query(
    'DELETE FROM files WHERE id = $1 AND user_id = $2 RETURNING id',
    [fileId, userId],
  );
  if (rows.length === 0) throw notFound();

  // Los metadatos ya no existen, así que el fichero es inaccesible aunque falle el borrado en disco.
  try {
    await fs.rm(diskPath(rows[0].id), { force: true });
  } catch (err) {
    console.error(`No se pudo borrar del disco el fichero ${rows[0].id}:`, err.message);
  }
}

module.exports = { upload, list, openForDownload, remove };
