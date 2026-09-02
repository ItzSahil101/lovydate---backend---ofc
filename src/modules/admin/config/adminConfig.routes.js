const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminConfig.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('config.read'), controller.getAllConfig);
router.patch('/:key', requirePermission('config.write'), controller.updateConfigKey);

module.exports = router;
