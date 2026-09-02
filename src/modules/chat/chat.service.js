const chatRepo = require('./chat.repository');
const { emitToConversation } = require('../../infrastructure/websocket/socketServer');
const { sendPushToUser } = require('../../infrastructure/firebase/fcm');
const { encodeCursor, decodeCursor } = require('../../shared/cursor');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');
const { isManagedMediaUrl } = require('../media/media.service');
const { assertNoRestriction } = require('../../middleware/restrictions');

const MESSAGING_DISABLED = 'MESSAGING_DISABLED';

function validateConversationId(conversationId) {
  if (!isUuid(conversationId)) {
    throw new BadRequestError('A valid conversation is required', 'INVALID_CONVERSATION_ID');
  }
}

async function listConversations(userId) {
  return chatRepo.getConversationsForUser(userId);
}

async function getConversation(conversationId, userId) {
  validateConversationId(conversationId);
  const isMember = await chatRepo.isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this conversation');
  }
  const details = await chatRepo.getConversationDetails(conversationId, userId);
  if (!details) {
    throw new NotFoundError('Conversation not found');
  }
  return details;
}

async function listMessages(conversationId, userId, limit = 50, cursor = null) {
  validateConversationId(conversationId);
  const isMember = await chatRepo.isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this conversation');
  }

  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const decoded = decodeCursor(cursor);

  const { items, hasMore } = await chatRepo.getMessages(
    conversationId,
    clampedLimit,
    decoded
  );

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[0];
    nextCursor = encodeCursor({
      createdAt: lastItem.createdAt,
      id: lastItem.id,
    });
  }

  return {
    items,
    nextCursor,
    hasMore,
  };
}

async function sendMessage(conversationId, senderId, payload = {}) {
  validateConversationId(conversationId);
  await assertNoRestriction(senderId, MESSAGING_DISABLED);
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const type = payload.type || 'text';
  const allowedTypes = new Set(['text', 'image', 'audio', 'video']);
  if (!allowedTypes.has(type)) {
    throw new BadRequestError('Unsupported message type', 'INVALID_MESSAGE_TYPE');
  }
  if (type === 'text' && !content) {
    throw new BadRequestError('Message content cannot be empty', 'EMPTY_MESSAGE');
  }
  if (type !== 'text' && (!payload.mediaUrl || typeof payload.mediaUrl !== 'string')) {
    throw new BadRequestError('An uploaded media URL is required', 'MEDIA_REQUIRED');
  }
  if (type !== 'text' && !isManagedMediaUrl(payload.mediaUrl)) {
    throw new BadRequestError('Chat media must be uploaded through LovyDate', 'INVALID_MEDIA_URL');
  }
  if (type !== 'text' &&
      (!payload.mimeType || !payload.mimeType.startsWith(`${type}/`))) {
    throw new BadRequestError('The media type does not match the message', 'INVALID_MEDIA_TYPE');
  }
  const durationSeconds = Number(payload.durationSeconds || 0);
  if (type === 'video' && (!Number.isFinite(durationSeconds) || durationSeconds <= 0)) {
    throw new BadRequestError('A valid video duration is required', 'INVALID_VIDEO');
  }
  if (type === 'video' && durationSeconds > 90) {
    throw new BadRequestError('Videos must be 1 minute 30 seconds or shorter', 'VIDEO_TOO_LONG');
  }

  const isMember = await chatRepo.isConversationMember(conversationId, senderId);
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this conversation');
  }

  const message = await chatRepo.insertMessage(
    conversationId,
    senderId,
    {
      content,
      type,
      mediaUrl: type === 'text' ? null : payload.mediaUrl,
      mimeType: type === 'text' ? null : payload.mimeType,
      sizeBytes: type === 'text' ? null : Number(payload.sizeBytes || 0) || null,
      durationSeconds: type === 'text' ? null : durationSeconds || null,
    }
  );

  emitToConversation(conversationId, 'message:new', {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    mediaUrl: message.mediaUrl,
    mimeType: message.mimeType,
    sizeBytes: message.sizeBytes,
    durationSeconds: message.durationSeconds,
    createdAt: message.createdAt,
  });

  try {
    const details = await chatRepo.getConversationDetails(conversationId, senderId);
    if (details && details.partnerUserId) {
      const senderName = details.partnerName ? details.partnerName : 'Someone';
      const preview = type === 'text'
        ? (content.length > 80 ? content.slice(0, 80) + '…' : content)
        : (type === 'image' ? '📷 Sent a photo' : (type === 'audio' ? '🎤 Sent a voice message' : '🎥 Sent a video'));

      sendPushToUser(details.partnerUserId, {
        title: 'New message from ' + (details.displayName || 'your match'),
        body: preview,
        data: {
          type: 'chat',
          conversationId,
          senderId,
          partnerId: senderId,
          partnerName: details.displayName || 'Match',
          partnerPhotoUrl: details.partnerPhotoUrl || '',
        },
      }).catch(() => {});
    }
  } catch (_) {}

  return message;
}

async function markRead(conversationId, userId, lastMessageId) {
  validateConversationId(conversationId);
  if (!isUuid(lastMessageId)) {
    throw new BadRequestError('A valid message is required', 'INVALID_MESSAGE_ID');
  }
  const isMember = await chatRepo.isConversationMember(conversationId, userId);
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this conversation');
  }

  await chatRepo.markConversationRead(conversationId, userId, lastMessageId);

  emitToConversation(conversationId, 'message:read', {
    conversationId,
    userId,
    lastReadMessageId: lastMessageId,
  });

  return { markedRead: true };
}

module.exports = {
  listConversations,
  getConversation,
  listMessages,
  sendMessage,
  markRead,
};
