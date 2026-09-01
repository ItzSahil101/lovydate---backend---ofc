const express = require('express');
const router = express.Router();
const blocksController = require('./blocks.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.use(requireAuth);

router.post(
  '/:targetUserId/block',
  rateLimiter({ action: 'block', max: 60, windowSeconds: 60 }),
  blocksController.blockUser
);

router.delete(
  '/:targetUserId/block',
  rateLimiter({ action: 'unblock', max: 60, windowSeconds: 60 }),
  blocksController.unblockUser
);

module.exports = router;
