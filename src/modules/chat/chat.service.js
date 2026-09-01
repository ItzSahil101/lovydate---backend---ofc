const chatRepo = require('./chat.repository');
const { emitToConversation } = require('../../infrastructure/websocket/socketServer');
const { encodeCursor, decodeCursor } = require('../../shared/cursor');
const { ForbiddenError, NotFoundError, BadRequestError } = require('../../shared/errors');

async function listConversations(userId) {
  return chatRepo.getConversationsForUser(userId);
}

async function getConversation(conversationId, userId) {
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
    const lastItem = items[items.length - 1];
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

async function sendMessage(conversationId, senderId, content) {
  if (!content || !content.trim()) {
    throw new BadRequestError('Message content cannot be empty');
  }

  const isMember = await chatRepo.isConversationMember(conversationId, senderId);
  if (!isMember) {
    throw new ForbiddenError('You are not a member of this conversation');
  }

  const message = await chatRepo.insertMessage(
    conversationId,
    senderId,
    content.trim()
  );

  emitToConversation(conversationId, 'message:new', {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    content: message.content,
    createdAt: message.createdAt,
  });

  return message;
}

async function markRead(conversationId, userId, lastMessageId) {
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
