'use strict';

// Contenidos mínimos de cada tipo. La API detecta el tipo por los primeros bytes (SPEC 1.4).
const fixtures = {
  // PNG real de 1x1 píxel.
  png: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
  // Cabecera JFIF + marcador de fin de imagen.
  jpeg: Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
  ]),
  pdf: Buffer.from('%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n'),
  text: Buffer.from('Hola, mundo.\nSegunda línea con tildes: áéíóú ñ.\r\n\tTabulada.\n'),
  gif: Buffer.from('R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==', 'base64'),
  elf: Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]), Buffer.alloc(56)]),
  zip: Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(26)]),
  textWithNul: Buffer.from('texto normal\u0000con un byte nulo\n'),
  invalidUtf8: Buffer.from([0x48, 0x6f, 0x6c, 0x61, 0x20, 0xc3, 0x28, 0x0a]),
};

module.exports = { fixtures };
