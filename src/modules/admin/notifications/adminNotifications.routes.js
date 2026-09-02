const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminNotifications.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('notifications.read'), controller.getNotificationStats);
router.get('/templates', requirePermission('notifications.read'), controller.listTemplates);
router.post('/templates', requirePermission('notifications.send'), controller.createTemplate);
router.put('/templates/:id', requirePermission('notifications.send'), controller.updateTemplate);
router.delete('/templates/:id', requirePermission('notifications.send'), controller.deleteTemplate);

module.exports = router;
