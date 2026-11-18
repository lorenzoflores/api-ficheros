'use strict';

const { Router } = require('express');
const healthRoutes = require('./healthRoutes');
const authRoutes = require('./authRoutes');
const fileRoutes = require('./fileRoutes');
const metricsRoutes = require('./metricsRoutes');
const { markRouteBase } = require('../middleware/routePattern');

const router = Router();

// markRouteBase guarda el prefijo de cada router para poder registrar el patrón de la
// ruta ("/files/:id") en logs y métricas (ver middleware/routePattern.js).
router.use('/health', markRouteBase, healthRoutes);
router.use('/auth', markRouteBase, authRoutes);
router.use('/files', markRouteBase, fileRoutes);
router.use('/metrics', markRouteBase, metricsRoutes);

module.exports = router;
