const redis = require('../../../infrastructure/redis/client');
const configRepo = require('./adminConfig.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

const PUBLIC_CONFIG_CACHE_KEY = 'app:config:public';

async function getAllConfig() {
  return configRepo.getAllConfig();
}

async function getPublicConfig() {
  try {
    const cached = await redis.get(PUBLIC_CONFIG_CACHE_KEY);
    if (cached) return JSON.parse(cached);
  } catch {}

  const config = await configRepo.getPublicConfig();

  try {
    await redis.set(PUBLIC_CONFIG_CACHE_KEY, JSON.stringify(config), 'EX', 300); // 5 min TTL
  } catch {}

  return config;
}

async function updateConfigKey({ key, value, admin, ipAddress }) {
  if (value === undefined) throw new BadRequestError('Value is required');

  const updated = await configRepo.updateConfigKey(key, value, admin.id);
  if (!updated) throw new NotFoundError(`Config key '${key}' not found`);

  try {
    await redis.del(PUBLIC_CONFIG_CACHE_KEY);
  } catch {}

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'APP_CONFIG_CHANGED',
    targetType: 'config',
    targetId: key,
    details: { value },
    ipAddress,
  });

  return updated;
}

module.exports = {
  getAllConfig,
  getPublicConfig,
  updateConfigKey,
};
