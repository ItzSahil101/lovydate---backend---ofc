const blocksRepo = require('./blocks.repository');
const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS } = require('../../config/constants');
const { BadRequestError } = require('../../shared/errors');

async function blockUser(blockerId, blockedId) {
  if (blockerId === blockedId) {
    throw new BadRequestError('You cannot block yourself', 'SELF_BLOCK_NOT_ALLOWED');
  }

  const result = await blocksRepo.insertBlock(blockerId, blockedId);

  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(blockerId)).catch(() => {});
  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(blockedId)).catch(() => {});

  return result;
}

async function unblockUser(blockerId, blockedId) {
  return blocksRepo.deleteBlock(blockerId, blockedId);
}

module.exports = {
  blockUser,
  unblockUser,
};
