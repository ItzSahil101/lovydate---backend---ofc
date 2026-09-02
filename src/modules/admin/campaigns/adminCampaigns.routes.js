const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminCampaigns.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('campaigns.read'), controller.listCampaigns);
router.post('/', requirePermission('campaigns.create'), controller.createCampaign);
router.get('/:campaignId', requirePermission('campaigns.read'), controller.getCampaignDetail);
router.patch('/:campaignId', requirePermission('campaigns.create'), controller.updateCampaign);

router.post('/:campaignId/estimate', requirePermission('campaigns.read'), controller.estimateAudience);
router.post('/:campaignId/test', requirePermission('notifications.send'), controller.testSend);
router.post('/:campaignId/send', requirePermission('campaigns.send'), controller.sendCampaign);
router.post('/:campaignId/schedule', requirePermission('campaigns.send'), controller.scheduleCampaign);
router.post('/:campaignId/cancel', requirePermission('campaigns.cancel'), controller.cancelCampaign);
router.get('/:campaignId/metrics', requirePermission('campaigns.read'), controller.getMetrics);

module.exports = router;
