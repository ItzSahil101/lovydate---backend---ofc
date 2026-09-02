const configService = require('./adminConfig.service');

async function getAllConfig(req, res, next) {
  try {
    const result = await configService.getAllConfig();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateConfigKey(req, res, next) {
  try {
    const { key } = req.params;
    const { value } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await configService.updateConfigKey({ key, value, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getPublicConfig(req, res, next) {
  try {
    const result = await configService.getPublicConfig();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAllConfig,
  updateConfigKey,
  getPublicConfig,
};
