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
  chatController.getMessages
);

router.post(
  '/:id/messages',
  rateLimiter({ action: 'message-send', max: 90, windowSeconds: 60 }),
  idempotency(),
  chatController.sendMessage
);

router.post(
  '/:id/read',
  rateLimiter({ action: 'message-read', max: 120, windowSeconds: 60 }),
  chatController.markRead
);

module.exports = router;
