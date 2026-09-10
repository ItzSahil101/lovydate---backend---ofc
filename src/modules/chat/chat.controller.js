const chatService = require('./chat.service');
const { success, paginated } = require('../../shared/response');

async function getConversations(req, res, next) {
  try {
    const conversations = await chatService.listConversations(req.user.userId);
    return success(res, { conversations });
  } catch (err) {
    next(err);
  }
}

async function getConversationDetails(req, res, next) {
  try {
    const details = await chatService.getConversation(req.params.id, req.user.userId);
    return success(res, details);
  } catch (err) {
    next(err);
  }
}

async function getMessages(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const cursor = req.query.cursor || null;

    const result = await chatService.listMessages(
      req.params.id,
      req.user.userId,
      limit,
      cursor
    );

    return paginated(res, result.items, result.nextCursor, result.hasMore);
  } catch (err) {
    next(err);
  }
}

async function sendMessage(req, res, next) {
  try {
    const message = await chatService.sendMessage(
      req.params.id,
      req.user.userId,
      req.body
    );
    return success(res, message, 201);
  } catch (err) {
    next(err);
  }
}

async function markRead(req, res, next) {
  try {
    const result = await chatService.markRead(
      req.params.id,
      req.user.userId,
      req.body.lastMessageId
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function reactToMessage(req, res, next) {
  try {
    const message = await chatService.reactToMessage(
      req.params.id, req.params.messageId, req.user.userId, req.body
    );
    return success(res, message);
  } catch (err) { next(err); }
}

async function deleteMessageForMe(req, res, next) {
  try {
    const result = await chatService.deleteMessageForMe(
      req.params.id, req.params.messageId, req.user.userId
    );
    return success(res, result);
  } catch (err) { next(err); }
}

async function unsendMessage(req, res, next) {
  try {
    const message = await chatService.unsendMessage(
      req.params.id, req.params.messageId, req.user.userId
    );
    return success(res, message);
  } catch (err) { next(err); }
}

module.exports = {
  getConversations,
  getConversationDetails,
  getMessages,
  sendMessage,
  markRead,
  reactToMessage,
  deleteMessageForMe,
  unsendMessage,
};
