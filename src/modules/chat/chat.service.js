const chatRepo = require('./chat.repository');
const { emitToConversation } = require('../../infrastructure/websocket/socketServer');
const { sendPushToUser } = require('../../infrastructure/firebase/fcm');
const { encodeCursor, decodeCursor } = require('../../shared/cursor');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');
const { isManagedMediaUrl } = require('../media/media.service');
const { assertNoRestriction } = require('../../middleware/restrictions');
const { cacheWrap, cacheDel, keys } = require('../../infrastructure/redis/cache');

const MESSAGING_DISABLED = 'MESSAGING_DISABLED';

// ── TTLs ──────────────────────────────────────────────────────────────────
const TTL_CONVERSATIONS = 30;  // seconds — refreshes quickly for unread counts
const TTL_MESSAGES      = 15;  // seconds — short so new messages appear fast

function validateConversationId(conversationId) {
  if (!isUuid(conversationId)) {
    throw new BadRequestError('A valid conversation is required', 'INVALID_CONVERSATION_ID');
  }
}

// ── Invalidation helpers ──────────────────────────────────────────────────

/** Bust the conversations list for both members of a conversation. */
async function _invalidateConversations(...userIds) {
  await Promise.all(
    userIds.filter(Boolean).map((uid) => cacheDel(keys.conversations(uid)))
  );
}

/** Bust the messages cache for a conversation for a specific user. */
async function _invalidateMessages(conversationId, userId) {
  await cacheDel(keys.messages(conversationId, userId));
}

// ── Public service methods ────────────────────────────────────────────────

async function listConversations(userId) {
  return cacheWrap(
    keys.conversations(userId),
    TTL_CONVERSATIONS,
    () => chatRepo.getConversationsForUser(userId),
  );
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

  // Only cache the first page (no cursor) — paginated pages are cheap since
  // they're rarely re-requested.
  if (!cursor) {
    return cacheWrap(
      keys.messages(conversationId, userId),
      TTL_MESSAGES,
      async () => {
        const { items, hasMore } = await chatRepo.getMessages(
          conversationId, userId, clampedLimit, decoded,
        );
        let nextCursor = null;
        if (hasMore && items.length > 0) {
          nextCursor = encodeCursor({ createdAt: items[0].createdAt, id: items[0].id });
        }
        return { items, nextCursor, hasMore };
      },
    );
  }

  // Paginated page — skip cache
  const { items, hasMore } = await chatRepo.getMessages(
    conversationId, userId, clampedLimit, decoded,
  );
  let nextCursor = null;
  if (hasMore && items.length > 0) {
    nextCursor = encodeCursor({ createdAt: items[0].createdAt, id: items[0].id });
  }
  return { items, nextCursor, hasMore };
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

  const conversationDetails = await chatRepo.getConversationDetails(conversationId, senderId);
  if (!conversationDetails || conversationDetails.isMatched === false) {
    throw new BadRequestError('You are no longer matched', 'CHAT_UNMATCHED');
  }

  const replyToMessageId = payload.replyToMessageId || null;
  if (replyToMessageId !== null) {
    if (!isUuid(replyToMessageId)) {
      throw new BadRequestError('A valid reply message is required', 'INVALID_REPLY_MESSAGE_ID');
    }
    const replyTarget = await chatRepo.getMessage(conversationId, replyToMessageId, senderId);
    if (!replyTarget || replyTarget.isUnsent) {
      throw new BadRequestError('The reply message is not in this conversation', 'INVALID_REPLY_MESSAGE');
    }
  }

  const message = await chatRepo.insertMessage(conversationId, senderId, {
    content,
    type,
    mediaUrl: type === 'text' ? null : payload.mediaUrl,
    mimeType: type === 'text' ? null : payload.mimeType,
    sizeBytes: type === 'text' ? null : Number(payload.sizeBytes || 0) || null,
    durationSeconds: type === 'text' ? null : durationSeconds || null,
    replyToMessageId,
  });

  // Bust caches for both participants so next poll gets fresh data
  const partnerId = conversationDetails.partnerUserId;
  await Promise.all([
    _invalidateMessages(conversationId, senderId),
    _invalidateMessages(conversationId, partnerId),
    _invalidateConversations(senderId, partnerId),
  ]);

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
    replyTo: message.replyTo,
    reactions: message.reactions,
    isUnsent: message.isUnsent,
  });

  try {
    const details = conversationDetails;
    if (details && details.partnerUserId) {
      const preview = type === 'text'
        ? (content.length > 80 ? content.slice(0, 80) + '…' : content)
        : (type === 'image' ? '📷 Sent a photo'
          : type === 'audio' ? '🎤 Sent a voice message'
          : '🎥 Sent a video');

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

const ALLOWED_REACTIONS = new Set(['\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F44D}', '\u{1F525}']);

async function reactToMessage(conversationId, messageId, userId, payload = {}) {
  validateConversationId(conversationId);
  if (!isUuid(messageId)) {
    throw new BadRequestError('A valid message is required', 'INVALID_MESSAGE_ID');
  }
  if (!(await chatRepo.isConversationMember(conversationId, userId))) {
    throw new ForbiddenError('You are not a member of this conversation');
  }
  const message = await chatRepo.getMessage(conversationId, messageId, userId);
  if (!message) throw new NotFoundError('Message not found');
  if (message.isUnsent) {
    throw new BadRequestError('An unsent message cannot be reacted to', 'MESSAGE_UNSENT');
  }
  const emoji = typeof payload.emoji === 'string' ? payload.emoji.trim() : '';
  if (!emoji) {
    await chatRepo.removeReaction(messageId, userId);
    const updated = await chatRepo.getMessage(conversationId, messageId, userId);
    emitToConversation(conversationId, 'message:updated', updated);
    await _invalidateMessages(conversationId, userId);
    return updated;
  }
  if (!ALLOWED_REACTIONS.has(emoji)) {
    throw new BadRequestError('Unsupported reaction', 'INVALID_REACTION');
  }
  const updated = await chatRepo.setReaction(conversationId, messageId, userId, emoji);
  emitToConversation(conversationId, 'message:updated', updated);
  await _invalidateMessages(conversationId, userId);
  return updated;
}

async function deleteMessageForMe(conversationId, messageId, userId) {
  validateConversationId(conversationId);
  if (!isUuid(messageId)) throw new BadRequestError('A valid message is required', 'INVALID_MESSAGE_ID');
  if (!(await chatRepo.isConversationMember(conversationId, userId))) {
    throw new ForbiddenError('You are not a member of this conversation');
  }
  if (!(await chatRepo.getMessage(conversationId, messageId, userId))) {
    throw new NotFoundError('Message not found');
  }
  await chatRepo.deleteMessageForUser(conversationId, messageId, userId);
  await _invalidateMessages(conversationId, userId);
  return { deleted: true };
}

async function unsendMessage(conversationId, messageId, userId) {
  validateConversationId(conversationId);
  if (!isUuid(messageId)) throw new BadRequestError('A valid message is required', 'INVALID_MESSAGE_ID');
  if (!(await chatRepo.isConversationMember(conversationId, userId))) {
    throw new ForbiddenError('You are not a member of this conversation');
  }
  const existing = await chatRepo.getMessage(conversationId, messageId, userId);
  if (!existing) throw new NotFoundError('Message not found');
  if (existing.senderId !== userId) {
    throw new ForbiddenError('Only the sender can unsend this message', 'MESSAGE_NOT_OWNED');
  }
  const updated = await chatRepo.unsendMessage(conversationId, messageId, userId);
  emitToConversation(conversationId, 'message:updated', updated);
  // Bust messages cache for both sides
  const details = await chatRepo.getConversationDetails(conversationId, userId);
  await Promise.all([
    _invalidateMessages(conversationId, userId),
    details?.partnerUserId ? _invalidateMessages(conversationId, details.partnerUserId) : null,
  ]);
  return updated;
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
  if (!(await chatRepo.getMessage(conversationId, lastMessageId, userId))) {
    throw new NotFoundError('Message not found in this conversation');
  }
  await chatRepo.markConversationRead(conversationId, userId, lastMessageId);

  // Unread count changed — bust conversations list so it reflects immediately
  await _invalidateConversations(userId);

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
  reactToMessage,
  deleteMessageForMe,
  unsendMessage,
  markRead,
};
