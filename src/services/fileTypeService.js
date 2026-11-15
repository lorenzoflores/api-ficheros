'use strict';

// Detección del tipo por contenido (magic numbers), nunca por extensión ni Content-Type (SPEC 1.4).
const SIGNATURES = [
  { mimeType: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mimeType: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
  { mimeType: 'application/pdf', bytes: [0x25, 0x50, 0x44, 0x46, 0x2d] }, // "%PDF-"
];

// Caracteres de control prohibidos en texto plano: C0 salvo \t \n \r, DEL y C1.
// eslint-disable-next-line no-control-regex -- buscarlos es precisamente el objetivo.
const FORBIDDEN_CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/;

const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

function startsWith(buffer, bytes) {
  return buffer.length >= bytes.length && bytes.every((byte, i) => buffer[i] === byte);
}

function isPlainText(buffer) {
  let text;
  try {
    text = utf8Decoder.decode(buffer);
  } catch {
    return false; // UTF-8 inválido
  }
  return !FORBIDDEN_CONTROL_CHARS.test(text);
}

// Devuelve el MIME detectado o null si el contenido no es de un tipo permitido.
function detectMimeType(buffer) {
  const match = SIGNATURES.find(({ bytes }) => startsWith(buffer, bytes));
  if (match) return match.mimeType;
  return isPlainText(buffer) ? 'text/plain' : null;
}

module.exports = { detectMimeType };
