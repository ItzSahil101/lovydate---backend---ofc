const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminSystem.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/health', requirePermission('system.read'), controller.getHealth);
router.get('/metrics', requirePermission('system.read'), controller.getMetrics);

module.exports = router;
