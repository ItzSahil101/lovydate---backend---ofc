const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminFeatureFlags.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('feature_flags.read'), controller.listFeatureFlags);
router.post('/', requirePermission('feature_flags.write'), controller.createFeatureFlag);
router.patch('/:flagId', requirePermission('feature_flags.write'), controller.updateFeatureFlag);

module.exports = router;
