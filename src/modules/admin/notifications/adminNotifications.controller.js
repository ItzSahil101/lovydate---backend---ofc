const notificationsService = require('./adminNotifications.service');

async function getNotificationStats(req, res, next) {
  try {
    const result = await notificationsService.getNotificationStats();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listTemplates(req, res, next) {
  try {
    const result = await notificationsService.listTemplates();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createTemplate(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await notificationsService.createTemplate({ ...req.body, admin: req.admin, ipAddress });
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getNotificationStats,
  listTemplates,
  createTemplate,
};
