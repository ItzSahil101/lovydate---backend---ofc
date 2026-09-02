const featureFlagsRepo = require('./adminFeatureFlags.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listFeatureFlags() {
  return featureFlagsRepo.listFeatureFlags();
}

async function createFeatureFlag(data, admin, ipAddress) {
  if (!data.key || !data.name) throw new BadRequestError('Key and name are required');

  const flag = await featureFlagsRepo.createFeatureFlag(data, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'FEATURE_FLAG_CREATED',
    targetType: 'feature_flag',
    targetId: flag.id,
    details: { key: data.key, name: data.name },
    ipAddress,
  });

  return flag;
}

async function updateFeatureFlag(id, data, admin, ipAddress) {
  const updated = await featureFlagsRepo.updateFeatureFlag(id, data, admin.id);
  if (!updated) throw new NotFoundError('Feature flag not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'FEATURE_FLAG_CHANGED',
    targetType: 'feature_flag',
    targetId: id,
    details: data,
    ipAddress,
  });

  return updated;
}

module.exports = {
  listFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
};
