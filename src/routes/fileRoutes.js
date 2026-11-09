'use strict';

const { Router } = require('express');
const fileController = require('../controllers/fileController');
const requireAuth = require('../middleware/requireAuth');
const uploadFile = require('../middleware/uploadFile');

const router = Router();

// La autenticación va primero: sin token no se lee el cuerpo (SPEC 1.6).
router.use(requireAuth);

router.post('/', uploadFile, fileController.upload);
router.get('/', fileController.list);
router.get('/:id', fileController.download);
router.delete('/:id', fileController.remove);

module.exports = router;
