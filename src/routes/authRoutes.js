'use strict';

const { Router } = require('express');
const authController = require('../controllers/authController');
const validateBody = require('../middleware/validateBody');
const { registerSchema, loginSchema } = require('./authSchemas');

const router = Router();

router.post('/register', validateBody(registerSchema), authController.register);
router.post('/login', validateBody(loginSchema), authController.login);

module.exports = router;
