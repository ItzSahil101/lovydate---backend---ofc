const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminRestrictions.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/', requirePermission('users.read'), controller.listRestrictions);

module.exports = router;
