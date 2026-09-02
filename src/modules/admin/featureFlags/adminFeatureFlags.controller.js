const featureFlagsService = require('./adminFeatureFlags.service');

async function listFeatureFlags(req, res, next) {
  try {
    const result = await featureFlagsService.listFeatureFlags();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createFeatureFlag(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await featureFlagsService.createFeatureFlag(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateFeatureFlag(req, res, next) {
  try {
    const { flagId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await featureFlagsService.updateFeatureFlag(flagId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
};
