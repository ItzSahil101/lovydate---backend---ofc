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

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
