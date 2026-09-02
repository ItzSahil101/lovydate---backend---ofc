const redis = require('../../../infrastructure/redis/client');
const interestsRepo = require('./adminInterests.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function invalidateInterestsCache() {
  try {
    await redis.del('interests:all');
    await redis.del('interests:list');
  } catch {}
}

async function listInterests() {
  return interestsRepo.listInterests();
}

async function getInterestDetail(id) {
  const item = await interestsRepo.getInterestDetail(id);
  if (!item) throw new NotFoundError('Interest not found');
  return item;
}

async function createInterest(data, admin, ipAddress) {
  if (!data.name || !data.category) {
    throw new BadRequestError('Name and category are required');
  }

  const interest = await interestsRepo.createInterest(data);
  await invalidateInterestsCache();

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'INTEREST_CREATED',
    targetType: 'interest',
    targetId: interest.id,
    details: { name: interest.name, category: interest.category },
    ipAddress,
  });

  return interest;
}

async function updateInterest(id, data, admin, ipAddress) {
  const updated = await interestsRepo.updateInterest(id, data);
  if (!updated) throw new NotFoundError('Interest not found');
  await invalidateInterestsCache();

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'INTEREST_UPDATED',
    targetType: 'interest',
    targetId: id,
    ipAddress,
  });

  return updated;
}

async function enableInterest(id, admin, ipAddress) {
  const res = await interestsRepo.setInterestActive(id, true);
  await invalidateInterestsCache();

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'INTEREST_ENABLED',
    targetType: 'interest',
    targetId: id,
    ipAddress,
  });

  return res;
}

async function disableInterest(id, admin, ipAddress) {
  const res = await interestsRepo.setInterestActive(id, false);
  await invalidateInterestsCache();

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'INTEREST_DISABLED',
    targetType: 'interest',
    targetId: id,
    ipAddress,
  });

  return res;
}

async function reorderInterests(items, admin, ipAddress) {
  if (!Array.isArray(items)) throw new BadRequestError('Items must be an array');
  await interestsRepo.reorderInterests(items);
  await invalidateInterestsCache();

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'INTERESTS_REORDERED',
    targetType: 'interest',
    targetId: 'multiple',
    ipAddress,
  });

  return { success: true };
}

module.exports = {
  listInterests,
  getInterestDetail,
  createInterest,
  updateInterest,
  enableInterest,
  disableInterest,
  reorderInterests,
};
