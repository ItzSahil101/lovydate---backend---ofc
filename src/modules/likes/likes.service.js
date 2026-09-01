const likesRepo = require('./likes.repository');
const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS } = require('../../config/constants');
const { emitToUser } = require('../../infrastructure/websocket/socketServer');
const { BadRequestError } = require('../../shared/errors');

async function likeUser(sourceUserId, targetUserId) {
  if (sourceUserId === targetUserId) {
    throw new BadRequestError('You cannot like yourself', 'SELF_LIKE_NOT_ALLOWED');
  }

  const result = await likesRepo.recordLikeAndCheckMatch(sourceUserId, targetUserId);

  try {
    await redis.lrem(CACHE_KEYS.DISCOVERY_CANDIDATES(sourceUserId), 0, targetUserId);
  } catch (_) {}

  if (result.isMatch && result.match) {
    emitToUser(sourceUserId, 'match:new', {
      matchId: result.match.id,
      conversationId: result.match.conversationId,
      partnerUserId: targetUserId,
    });

    emitToUser(targetUserId, 'match:new', {
      matchId: result.match.id,
      conversationId: result.match.conversationId,
      partnerUserId: sourceUserId,
    });
  }

  return result;
}

async function passUser(sourceUserId, targetUserId) {
  if (sourceUserId === targetUserId) {
    throw new BadRequestError('You cannot pass yourself', 'SELF_PASS_NOT_ALLOWED');
  }
  const result = await likesRepo.insertPass(sourceUserId, targetUserId);
  try {
    await redis.lrem(CACHE_KEYS.DISCOVERY_CANDIDATES(sourceUserId), 0, targetUserId);
  } catch (_) {}
  return result;
}

async function getStatus(sourceUserId, targetUserId) {
  return likesRepo.checkLikeAndMatchStatus(sourceUserId, targetUserId);
}

async function unlikeUser(sourceUserId, targetUserId) {
  return likesRepo.unlikeUser(sourceUserId, targetUserId);
}

module.exports = {
  likeUser,
  passUser,
  getStatus,
  unlikeUser,
};
