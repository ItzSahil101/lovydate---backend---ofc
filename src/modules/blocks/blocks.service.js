const blocksRepo = require('./blocks.repository');
const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS } = require('../../config/constants');
const { BadRequestError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');

async function blockUser(blockerId, blockedId) {
  if (!isUuid(blockedId)) {
    throw new BadRequestError('A valid target user is required', 'INVALID_TARGET_USER');
  }
  if (blockerId === blockedId) {
    throw new BadRequestError('You cannot block yourself', 'SELF_BLOCK_NOT_ALLOWED');
  }

  const result = await blocksRepo.insertBlock(blockerId, blockedId);
  if (result.targetUnavailable) {
    throw new BadRequestError('This profile is no longer available', 'TARGET_USER_UNAVAILABLE');
  }

  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(blockerId)).catch(() => {});
  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(blockedId)).catch(() => {});

  return result;
}

async function unblockUser(blockerId, blockedId) {
  if (!isUuid(blockedId)) {
    throw new BadRequestError('A valid target user is required', 'INVALID_TARGET_USER');
  }
  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(blockerId)).catch(() => {});
  return blocksRepo.deleteBlock(blockerId, blockedId);
}

async function getBlockedUsers(userId) {
  return blocksRepo.getBlockedUsers(userId);
}

module.exports = {
  blockUser,
  unblockUser,
  getBlockedUsers,
};
