const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');
const controller = require('./adminAlerts.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/', controller.getAlerts);

module.exports = router;
