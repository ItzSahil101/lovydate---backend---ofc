const likesRepo = require('./likes.repository');
const notificationRepo = require('../notifications/notifications.repository');
const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS } = require('../../config/constants');
const { emitToUser } = require('../../infrastructure/websocket/socketServer');
const { sendPushToUser } = require('../../infrastructure/firebase/fcm');
const { BadRequestError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');

function validateTargetUser(sourceUserId, targetUserId, action) {
  if (!isUuid(targetUserId)) {
    throw new BadRequestError('A valid target user is required', 'INVALID_TARGET_USER');
  }
  if (sourceUserId === targetUserId) {
    throw new BadRequestError(`You cannot ${action} yourself`, `SELF_${action.toUpperCase()}_NOT_ALLOWED`);
  }
}

async function likeUser(sourceUserId, targetUserId) {
  validateTargetUser(sourceUserId, targetUserId, 'like');

  const result = await likesRepo.recordLikeAndCheckMatch(sourceUserId, targetUserId);
  if (result.targetUnavailable) {
    throw new BadRequestError('This profile is no longer available', 'TARGET_USER_UNAVAILABLE');
  }
  if (result.blocked) {
    throw new BadRequestError('You cannot like this profile', 'USER_INTERACTION_BLOCKED');
  }

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

    notificationRepo.createNotification({
      recipientId: targetUserId,
      senderId: sourceUserId,
      type: 'match',
      entityId: result.match.conversationId,
      message: "It's a Match! Start chatting now.",
    }).catch(() => {});

    notificationRepo.createNotification({
      recipientId: sourceUserId,
      senderId: targetUserId,
      type: 'match',
      entityId: result.match.conversationId,
      message: "It's a Match! Start chatting now.",
    }).catch(() => {});

    sendPushToUser(targetUserId, {
      title: "It's a Match! 🎉",
      body: 'You have a new mutual match on LövyDate! Tap to start chatting.',
      data: {
        type: 'match',
        conversationId: result.match.conversationId,
      },
    }).catch(() => {});
  } else {
    // Single Like notification
    notificationRepo.createNotification({
      recipientId: targetUserId,
      senderId: sourceUserId,
      type: 'like',
      message: 'liked your profile!',
    }).catch(() => {});

    sendPushToUser(targetUserId, {
      title: 'New Like! ❤️',
      body: 'Someone liked your profile on LövyDate!',
      data: {
        type: 'like',
        senderId: sourceUserId,
      },
    }).catch(() => {});
  }

  return result;
}

async function passUser(sourceUserId, targetUserId) {
  validateTargetUser(sourceUserId, targetUserId, 'pass');
  const result = await likesRepo.insertPass(sourceUserId, targetUserId);
  if (result.targetUnavailable) {
    throw new BadRequestError('This profile is no longer available', 'TARGET_USER_UNAVAILABLE');
  }
  if (result.blocked) {
    throw new BadRequestError('You cannot interact with this profile', 'USER_INTERACTION_BLOCKED');
  }
  if (result.alreadyMatched) {
    throw new BadRequestError('You are already matched with this profile', 'ALREADY_MATCHED');
  }
  try {
    await redis.lrem(CACHE_KEYS.DISCOVERY_CANDIDATES(sourceUserId), 0, targetUserId);
  } catch (_) {}
  return result;
}

async function getStatus(sourceUserId, targetUserId) {
  validateTargetUser(sourceUserId, targetUserId, 'like');
  return likesRepo.checkLikeAndMatchStatus(sourceUserId, targetUserId);
}

async function unlikeUser(sourceUserId, targetUserId) {
  validateTargetUser(sourceUserId, targetUserId, 'like');
  const result = await likesRepo.unlikeUser(sourceUserId, targetUserId);
  await Promise.all([
    redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(sourceUserId)).catch(() => {}),
    redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(targetUserId)).catch(() => {}),
  ]);
  return result;
}

module.exports = {
  likeUser,
  passUser,
  getStatus,
  unlikeUser,
};
