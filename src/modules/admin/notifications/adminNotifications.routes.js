const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminNotifications.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('notifications.read'), controller.getNotificationStats);
router.get('/templates', requirePermission('notifications.read'), controller.listTemplates);
router.post('/templates', requirePermission('notifications.send'), controller.createTemplate);

module.exports = router;
