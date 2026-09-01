const express = require('express');
const router = express.Router();
const likesController = require('./likes.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { idempotency } = require('../../middleware/idempotency');

router.use(requireAuth);

router.post(
  '/',
  rateLimiter({ action: 'like', max: 120, windowSeconds: 60 }),
  idempotency(),
  likesController.likeUser
);

router.post(
  '/pass',
  rateLimiter({ action: 'pass', max: 180, windowSeconds: 60 }),
  likesController.passUser
);

router.post(
  '/:targetUserId/like',
  rateLimiter({ action: 'like', max: 120, windowSeconds: 60 }),
  idempotency(),
  likesController.likeUser
);

router.post(
  '/:targetUserId/pass',
  rateLimiter({ action: 'pass', max: 180, windowSeconds: 60 }),
  likesController.passUser
);

router.get(
  '/status/:targetUserId',
  likesController.getStatus
);

router.delete(
  '/:targetUserId',
  likesController.unlikeUser
);

module.exports = router;
