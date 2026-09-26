const express = require('express');
const router = express.Router();
const chatController = require('./chat.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { idempotency } = require('../../middleware/idempotency');

router.use(requireAuth);

router.get(
  '/',
  rateLimiter({ action: 'conversations-list', max: 120, windowSeconds: 60 }),
  (req, res, next) => {
    // Serve stale instantly, revalidate in background — matches our 30 s Redis TTL.
    res.set('Cache-Control', 'private, max-age=10, stale-while-revalidate=20');
    next();
  },
  chatController.getConversations
);

router.get(
  '/:id',
  rateLimiter({ action: 'conversation-view', max: 120, windowSeconds: 60 }),
  chatController.getConversationDetails
);

router.get(
  '/:id/messages',
  rateLimiter({ action: 'messages-list', max: 120, windowSeconds: 60 }),
  (req, res, next) => {
    // Short window so new messages surface fast; stale-while-revalidate covers the gap.
    res.set('Cache-Control', 'private, max-age=5, stale-while-revalidate=10');
    next();
  },
  chatController.getMessages
);

router.post(
  '/:id/messages',
  rateLimiter({ action: 'message-send', max: 90, windowSeconds: 60 }),
  idempotency(),
  chatController.sendMessage
);

router.put(
  '/:id/messages/:messageId/reaction',
  rateLimiter({ action: 'message-react', max: 120, windowSeconds: 60 }),
  chatController.reactToMessage
);

router.delete(
  '/:id/messages/:messageId/unsend',
  rateLimiter({ action: 'message-unsend', max: 60, windowSeconds: 60 }),
  chatController.unsendMessage
);

router.delete(
  '/:id/messages/:messageId',
  rateLimiter({ action: 'message-delete-for-me', max: 120, windowSeconds: 60 }),
  chatController.deleteMessageForMe
);

router.post(
  '/:id/read',
  rateLimiter({ action: 'message-read', max: 120, windowSeconds: 60 }),
  chatController.markRead
);

module.exports = router;
