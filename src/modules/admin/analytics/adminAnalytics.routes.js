const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminAnalytics.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/overview', requirePermission('analytics.read'), controller.getOverview);
router.get('/growth', requirePermission('analytics.read'), controller.getGrowth);
router.get('/funnel', requirePermission('analytics.read'), controller.getFunnel);
router.get('/discovery', requirePermission('analytics.read'), controller.getDiscovery);
router.get('/matches', requirePermission('analytics.read'), controller.getMatches);
router.get('/chat', requirePermission('analytics.read'), controller.getChat);
router.get('/feed', requirePermission('analytics.read'), controller.getFeed);
router.get('/retention', requirePermission('analytics.read'), controller.getRetention);
router.get('/moderation', requirePermission('analytics.read'), controller.getModeration);
router.get('/notifications', requirePermission('analytics.read'), controller.getNotifications);

module.exports = router;
