const express = require('express');
const router = express.Router();
const notificationController = require('./notifications.controller');
const { requireAuth } = require('../../middleware/auth');

router.use(requireAuth);

router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/mark-all-read', notificationController.markAllAsRead);
router.patch('/:id/read', notificationController.markAsRead);
router.post('/device-token', notificationController.registerDeviceToken);
router.delete('/device-token', notificationController.removeDeviceToken);

module.exports = router;
