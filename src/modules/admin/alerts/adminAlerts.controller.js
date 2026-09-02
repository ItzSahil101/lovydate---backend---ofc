const alertsService = require('./adminAlerts.service');

async function getAlerts(req, res, next) {
  try {
    const result = await alertsService.getOperationalAlerts();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAlerts,
};
