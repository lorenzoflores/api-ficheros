'use strict';

const authService = require('../services/authService');

async function register(req, res) {
  const user = await authService.register(req.body.email, req.body.password);
  res.status(201).json({ id: user.id, email: user.email });
}

async function login(req, res) {
  const result = await authService.login(req.body.email, req.body.password);
  res.status(200).json(result);
}

module.exports = { register, login };
