const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminDashboard.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/summary', requirePermission('dashboard.read'), controller.getSummary);
router.get('/live', requirePermission('dashboard.read'), controller.getLiveActivity);
router.get('/chart', requirePermission('dashboard.read'), controller.getChart);
router.get('/activity', requirePermission('dashboard.read'), controller.getActivity);

module.exports = router;
