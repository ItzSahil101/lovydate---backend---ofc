const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminAppeals.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('appeals.read'), controller.listAppeals);
router.get('/:appealId', requirePermission('appeals.read'), controller.getAppealDetail);
router.post('/:appealId/approve', requirePermission('appeals.resolve'), controller.approveAppeal);
router.post('/:appealId/reject', requirePermission('appeals.resolve'), controller.rejectAppeal);

module.exports = router;
