'use strict';

const { Router } = require('express');
const metricsController = require('../controllers/metricsController');
const requireMetricsToken = require('../middleware/requireMetricsToken');

const router = Router();

router.get('/', requireMetricsToken, metricsController.getMetrics);

module.exports = router;
