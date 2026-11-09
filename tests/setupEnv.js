'use strict';

const os = require('node:os');
const path = require('node:path');

// Secreto fijo para los tests, independiente del .env de desarrollo.
process.env.JWT_SECRET = 'secreto-de-tests-solo-para-jest-0123456789';

// Los ficheros subidos en los tests van a una carpeta temporal, nunca a ./uploads.
process.env.UPLOAD_DIR = path.join(os.tmpdir(), 'api-ficheros-tests');
