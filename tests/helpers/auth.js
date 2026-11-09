'use strict';

const request = require('supertest');
const app = require('../../src/app');

// Registra un usuario por la API y devuelve su id y un token válido.
async function createUser(email, password = 'secreta123') {
  const reg = await request(app).post('/auth/register').send({ email, password });
  if (reg.status !== 201) throw new Error(`Registro fallido (${reg.status}): ${JSON.stringify(reg.body)}`);
  const log = await request(app).post('/auth/login').send({ email, password });
  return { id: reg.body.id, token: log.body.token };
}

module.exports = { createUser };
