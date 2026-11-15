'use strict';

const { z } = require('zod');

const BCRYPT_MAX_BYTES = 72; // bcrypt ignora lo que pase de 72 bytes.

const email = z
  .string({ error: 'El email es obligatorio y debe ser un texto' })
  .trim()
  .toLowerCase()
  .max(254, { error: 'El email no puede superar 254 caracteres' })
  .pipe(z.email({ error: 'El email no tiene un formato válido' }));

const registerSchema = z.object({
  email,
  password: z
    .string({ error: 'La contraseña es obligatoria y debe ser un texto' })
    .min(8, { error: 'La contraseña debe tener al menos 8 caracteres' })
    .refine((pw) => Buffer.byteLength(pw, 'utf8') <= BCRYPT_MAX_BYTES, {
      error: `La contraseña no puede superar ${BCRYPT_MAX_BYTES} bytes`,
    }),
});

// En el login no se reaplican las reglas de longitud: un usuario creado con
// reglas anteriores debe poder entrar. Basta con que ambos campos existan.
const loginSchema = z.object({
  email,
  password: z
    .string({ error: 'La contraseña es obligatoria y debe ser un texto' })
    .min(1, { error: 'La contraseña es obligatoria' }),
});

module.exports = { registerSchema, loginSchema };
