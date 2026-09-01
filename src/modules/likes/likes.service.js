const likesRepo = require('./likes.repository');
const { emitToUser } = require('../../infrastructure/websocket/socketServer');
const { BadRequestError } = require('../../shared/errors');

async function likeUser(sourceUserId, targetUserId) {
  if (sourceUserId === targetUserId) {
    throw new BadRequestError('You cannot like yourself', 'SELF_LIKE_NOT_ALLOWED');
  }

  const result = await likesRepo.recordLikeAndCheckMatch(sourceUserId, targetUserId);

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
  return likesRepo.insertPass(sourceUserId, targetUserId);
}

module.exports = {
  likeUser,
  passUser,
};
