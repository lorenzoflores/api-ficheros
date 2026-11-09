'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const request = require('supertest');
const app = require('../src/app');
const { pool, resetDb } = require('./helpers/db');
const { createUser } = require('./helpers/auth');
const { fixtures } = require('./helpers/fixtures');

const MAX_SIZE = 10 * 1024 * 1024;
const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

const auth = (token) => ({ Authorization: `Bearer ${token}` });

function upload(token, content, filename, contentType) {
  const req = request(app).post('/files');
  if (token) req.set(auth(token));
  return req.attach('file', content, contentType ? { filename, contentType } : filename);
}

// supertest no convierte en Buffer las respuestas binarias que no son imágenes: se fuerza.
function binaryParser(res, callback) {
  const chunks = [];
  res.on('data', (chunk) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

function download(token, id) {
  return request(app).get(`/files/${id}`).set(auth(token)).buffer(true).parse(binaryParser);
}

const listIds = async (token) =>
  (await request(app).get('/files').set(auth(token))).body.files.map((f) => f.id);

const diskFiles = async () => fs.readdir(process.env.UPLOAD_DIR).catch(() => []);

const expectError = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
};

let ana;
let beto;

beforeEach(async () => {
  await resetDb();
  ana = await createUser('ana@example.com');
  beto = await createUser('beto@example.com');
});

afterAll(() => pool.end());

describe('POST /files', () => {
  test('E-04: sube un PNG y responde 201 con sus metadatos', async () => {
    const res = await upload(ana.token, fixtures.png, 'foto.png');

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      name: 'foto.png',
      size: fixtures.png.length,
      mimeType: 'image/png',
      createdAt: expect.any(String),
    });
    expect(new Date(res.body.createdAt).toISOString()).toBe(res.body.createdAt);
  });

  test('guarda los bytes en disco con el id como nombre y los metadatos en PostgreSQL', async () => {
    const res = await upload(ana.token, fixtures.pdf, 'informe.pdf');

    const onDisk = await fs.readFile(path.join(process.env.UPLOAD_DIR, res.body.id));
    expect(onDisk.equals(fixtures.pdf)).toBe(true);

    const { rows } = await pool.query('SELECT user_id, original_name FROM files WHERE id = $1', [res.body.id]);
    expect(rows).toEqual([{ user_id: ana.id, original_name: 'informe.pdf' }]);
  });

  test('un nombre con ruta no sale de la carpeta de subidas: solo se guarda el nombre base', async () => {
    const res = await upload(ana.token, fixtures.text, '../../etc/passwd');

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('passwd');
    expect(await diskFiles()).toEqual([res.body.id]);
  });

  test('conserva nombres con caracteres no ASCII', async () => {
    const res = await upload(ana.token, fixtures.text, 'año contable ñ.txt');

    expect(res.body.name).toBe('año contable ñ.txt');
  });

  test('A-05: sin token responde 401 y no guarda nada', async () => {
    expectError(await upload(null, fixtures.png, 'foto.png'), 401, 'UNAUTHORIZED');
    expect(await diskFiles()).toEqual([]);
  });

  describe('tamaño máximo (10 MB)', () => {
    test('S-01: acepta un fichero de exactamente 10 485 760 bytes', async () => {
      const res = await upload(ana.token, Buffer.alloc(MAX_SIZE, 'a'), 'grande.txt');

      expect(res.status).toBe(201);
      expect(res.body.size).toBe(MAX_SIZE);
    });

    test('S-02: rechaza 10 485 761 bytes con 413 FILE_TOO_LARGE y no guarda nada', async () => {
      const res = await upload(ana.token, Buffer.alloc(MAX_SIZE + 1, 'a'), 'grande.txt');

      expectError(res, 413, 'FILE_TOO_LARGE');
      expect(await listIds(ana.token)).toEqual([]);
      expect(await diskFiles()).toEqual([]);
    });

    test('el tamaño se comprueba antes que el tipo: un binario enorme da 413, no 415', async () => {
      const res = await upload(ana.token, Buffer.alloc(MAX_SIZE + 1, 0), 'binario.bin');

      expectError(res, 413, 'FILE_TOO_LARGE');
    });

    test('S-03: sin campo "file" responde 400 FILE_REQUIRED', async () => {
      const res = await request(app).post('/files').set(auth(ana.token)).field('otro', 'valor');

      expectError(res, 400, 'FILE_REQUIRED');
    });

    test('S-03: el fichero en un campo con otro nombre responde 400 FILE_REQUIRED', async () => {
      const res = await request(app).post('/files').set(auth(ana.token)).attach('archivo', fixtures.png, 'foto.png');

      expectError(res, 400, 'FILE_REQUIRED');
    });

    test('S-03: una petición que no es multipart responde 400 FILE_REQUIRED', async () => {
      const res = await request(app).post('/files').set(auth(ana.token)).send({ file: 'hola' });

      expectError(res, 400, 'FILE_REQUIRED');
    });

    test('S-04: un fichero de 0 bytes responde 400 FILE_REQUIRED', async () => {
      expectError(await upload(ana.token, Buffer.alloc(0), 'vacio.txt'), 400, 'FILE_REQUIRED');
    });
  });

  describe('tipo detectado por contenido', () => {
    test.each([
      ['PNG', fixtures.png, 'a.png', 'image/png'],
      ['JPEG', fixtures.jpeg, 'a.jpg', 'image/jpeg'],
      ['PDF', fixtures.pdf, 'a.pdf', 'application/pdf'],
      ['texto plano', fixtures.text, 'a.txt', 'text/plain'],
    ])('T-01: acepta %s con mimeType %s', async (_tipo, content, filename, mimeType) => {
      const res = await upload(ana.token, content, filename);

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe(mimeType);
    });

    test('T-02: un PNG llamado foto.txt y declarado text/plain se guarda como image/png', async () => {
      const res = await upload(ana.token, fixtures.png, 'foto.txt', 'text/plain');

      expect(res.status).toBe(201);
      expect(res.body.mimeType).toBe('image/png');
    });

    test.each([
      ['ejecutable ELF', fixtures.elf],
      ['ZIP', fixtures.zip],
    ])('T-03: un %s llamado doc.pdf y declarado application/pdf responde 415', async (_tipo, content) => {
      const res = await upload(ana.token, content, 'doc.pdf', 'application/pdf');

      expectError(res, 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    test.each([
      ['con un byte NUL', fixtures.textWithNul],
      ['con UTF-8 inválido', fixtures.invalidUtf8],
    ])('T-04: un notas.txt %s responde 415', async (_caso, content) => {
      expectError(await upload(ana.token, content, 'notas.txt', 'text/plain'), 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    test('T-05: un GIF válido responde 415', async () => {
      expectError(await upload(ana.token, fixtures.gif, 'anim.gif', 'image/gif'), 415, 'UNSUPPORTED_MEDIA_TYPE');
    });

    test('T-06: tras un 415 el fichero no aparece en el listado ni en disco', async () => {
      await upload(ana.token, fixtures.elf, 'doc.pdf', 'application/pdf');

      expect(await listIds(ana.token)).toEqual([]);
      expect(await diskFiles()).toEqual([]);
    });
  });
});

describe('GET /files', () => {
  test('E-05: lista exactamente mis ficheros, del más reciente al más antiguo', async () => {
    const first = await upload(ana.token, fixtures.png, 'primero.png');
    const second = await upload(ana.token, fixtures.pdf, 'segundo.pdf');

    const res = await request(app).get('/files').set(auth(ana.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: [second.body, first.body] });
  });

  test('sin ficheros devuelve una lista vacía', async () => {
    const res = await request(app).get('/files').set(auth(ana.token));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ files: [] });
  });

  test('A-05: sin token responde 401', async () => {
    expectError(await request(app).get('/files'), 401, 'UNAUTHORIZED');
  });
});

describe('GET /files/:id', () => {
  test('E-06: descarga los bytes originales con Content-Type, Content-Disposition y Content-Length', async () => {
    const { body: file } = await upload(ana.token, fixtures.pdf, 'informe.pdf');

    const res = await download(ana.token, file.id);

    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, fixtures.pdf)).toBe(0);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="informe.pdf"');
    expect(res.headers['content-length']).toBe(String(fixtures.pdf.length));
  });

  test('un nombre no ASCII se descarga con un filename ASCII y el original en filename*', async () => {
    const { body: file } = await upload(ana.token, fixtures.text, 'año "fiscal".txt');

    const res = await download(ana.token, file.id);

    expect(res.headers['content-disposition']).toBe(
      'attachment; filename="a_o _fiscal_.txt"; filename*=UTF-8\'\'a%C3%B1o%20%22fiscal%22.txt',
    );
  });

  test('el Content-Type es el detectado, no el que declaró el cliente', async () => {
    const { body: file } = await upload(ana.token, fixtures.png, 'foto.txt', 'text/plain');

    const res = await download(ana.token, file.id);

    expect(res.headers['content-type']).toBe('image/png');
    expect(Buffer.compare(res.body, fixtures.png)).toBe(0);
  });

  test('un id inexistente responde 404 NOT_FOUND', async () => {
    expectError(await request(app).get(`/files/${UNKNOWN_ID}`).set(auth(ana.token)), 404, 'NOT_FOUND');
  });

  test('un id con formato inválido responde 404 NOT_FOUND', async () => {
    expectError(await request(app).get('/files/no-es-un-uuid').set(auth(ana.token)), 404, 'NOT_FOUND');
  });

  test('A-05: sin token responde 401', async () => {
    expectError(await request(app).get(`/files/${UNKNOWN_ID}`), 401, 'UNAUTHORIZED');
  });
});

describe('DELETE /files/:id', () => {
  test('E-07: borra el fichero propio (204) y desaparece del listado, de la descarga y del disco', async () => {
    const { body: file } = await upload(ana.token, fixtures.png, 'foto.png');

    const res = await request(app).delete(`/files/${file.id}`).set(auth(ana.token));

    expect(res.status).toBe(204);
    expect(res.text).toBe('');
    expectError(await request(app).get(`/files/${file.id}`).set(auth(ana.token)), 404, 'NOT_FOUND');
    expect(await listIds(ana.token)).toEqual([]);
    expect(await diskFiles()).toEqual([]);
  });

  test('borrar dos veces el mismo fichero: la segunda vez responde 404', async () => {
    const { body: file } = await upload(ana.token, fixtures.png, 'foto.png');
    await request(app).delete(`/files/${file.id}`).set(auth(ana.token));

    expectError(await request(app).delete(`/files/${file.id}`).set(auth(ana.token)), 404, 'NOT_FOUND');
  });

  test('un id con formato inválido responde 404 NOT_FOUND', async () => {
    expectError(await request(app).delete('/files/no-es-un-uuid').set(auth(ana.token)), 404, 'NOT_FOUND');
  });

  test('A-05: sin token responde 401', async () => {
    expectError(await request(app).delete(`/files/${UNKNOWN_ID}`), 401, 'UNAUTHORIZED');
  });
});

describe('aislamiento entre usuarios (Ana sube F; Beto intenta acceder)', () => {
  let fileF;

  beforeEach(async () => {
    fileF = (await upload(ana.token, fixtures.text, 'privado.txt')).body;
  });

  test('I-01: Beto no ve F en su listado', async () => {
    expect(await listIds(beto.token)).toEqual([]);
  });

  test('I-02: Beto no puede descargar F: 404 (nunca 403) y sin sus bytes', async () => {
    const res = await request(app).get(`/files/${fileF.id}`).set(auth(beto.token));

    expectError(res, 404, 'NOT_FOUND');
    expect(res.text).not.toContain('Hola, mundo');
  });

  test('I-03 + I-04: Beto no puede borrar F (404) y F sigue intacto para Ana', async () => {
    expectError(await request(app).delete(`/files/${fileF.id}`).set(auth(beto.token)), 404, 'NOT_FOUND');

    const res = await download(ana.token, fileF.id);
    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body, fixtures.text)).toBe(0);
  });

  test('I-05: la respuesta para un fichero ajeno es idéntica a la de uno inexistente', async () => {
    const foreign = await request(app).get(`/files/${fileF.id}`).set(auth(beto.token));
    const missing = await request(app).get(`/files/${UNKNOWN_ID}`).set(auth(beto.token));

    expect(foreign.status).toBe(missing.status);
    expect(foreign.body).toEqual(missing.body);
  });
});
