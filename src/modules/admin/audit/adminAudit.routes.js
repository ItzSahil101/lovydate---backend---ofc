const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminAudit.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/', requirePermission('audit.read'), controller.getAuditLogs);

module.exports = router;
