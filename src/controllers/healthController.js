'use strict';

const healthService = require('../services/healthService');

async function getHealth(req, res) {
  const result = await healthService.checkHealth();
  res.status(200).json(result);
}

module.exports = { getHealth };
