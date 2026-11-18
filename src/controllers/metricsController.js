'use strict';

const { register } = require('../metrics');

async function getMetrics(req, res) {
  const body = await register.metrics();
  res.set('Content-Type', register.contentType);
  res.status(200).send(body);
}

module.exports = { getMetrics };
