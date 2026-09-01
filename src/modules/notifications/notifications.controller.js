const notificationService = require('./notifications.service');
const { success } = require('../../shared/response');

async function getNotifications(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '40', 10);
    const notifications = await notificationService.getNotifications(req.user.userId, limit);
    return success(res, notifications);
  } catch (err) {
    next(err);
  }
}

async function getUnreadCount(req, res, next) {
  try {
    const count = await notificationService.getUnreadCount(req.user.userId);
    return success(res, { count });
  } catch (err) {
    next(err);
  }
}

async function markAsRead(req, res, next) {
  try {
    const result = await notificationService.markAsRead(req.user.userId, req.params.id);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function markAllAsRead(req, res, next) {
  try {
    await notificationService.markAllAsRead(req.user.userId);
    return success(res, { success: true });
  } catch (err) {
    next(err);
  }
}

const { saveDeviceToken, removeDeviceToken: deleteToken } = require('../../infrastructure/firebase/fcm');

async function registerDeviceToken(req, res, next) {
  try {
    const { deviceToken, platform } = req.body;
    await saveDeviceToken(req.user.userId, deviceToken, platform);
    return success(res, { registered: true });
  } catch (err) {
    next(err);
  }
}

async function removeDeviceToken(req, res, next) {
  try {
    const { deviceToken } = req.body;
    await deleteToken(req.user.userId, deviceToken);
    return success(res, { removed: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  registerDeviceToken,
  removeDeviceToken,
};
