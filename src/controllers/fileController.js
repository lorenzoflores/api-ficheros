'use strict';

const { pipeline } = require('node:stream/promises');
const fileService = require('../services/fileService');

// Content-Disposition con el formato de SPEC 1.3: attachment; filename="<name>".
// Si el nombre no es ASCII imprimible, filename lleva una versión ASCII y filename* (RFC 5987) el original.
function contentDisposition(name) {
  const fallback = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  let header = `attachment; filename="${fallback}"`;
  if (fallback !== name) {
    const encoded = encodeURIComponent(name).replace(
      /['()*]/g,
      (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
    );
    header += `; filename*=UTF-8''${encoded}`;
  }
  return header;
}

async function upload(req, res) {
  const file = await fileService.upload(req.user.id, req.file);
  res.status(201).json(file);
}

async function list(req, res) {
  const files = await fileService.list(req.user.id);
  res.status(200).json({ files });
}

async function download(req, res) {
  const { file, handle } = await fileService.openForDownload(req.user.id, req.params.id);
  res.status(200);
  res.set('Content-Disposition', contentDisposition(file.name));
  res.set('Content-Type', file.mimeType);
  res.set('Content-Length', String(file.size));
  await pipeline(handle.createReadStream(), res);
}

async function remove(req, res) {
  await fileService.remove(req.user.id, req.params.id);
  res.status(204).end();
}

module.exports = { upload, list, download, remove };
