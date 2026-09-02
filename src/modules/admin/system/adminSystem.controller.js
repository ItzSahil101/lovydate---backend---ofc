const systemService = require('./adminSystem.service');

async function getHealth(req, res, next) {
  try {
    const result = await systemService.getSystemHealth();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getMetrics(req, res, next) {
  try {
    const result = await systemService.getSystemMetrics();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth,
  getMetrics,
};
