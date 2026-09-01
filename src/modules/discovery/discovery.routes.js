const express = require('express');
const router = express.Router();
const discoveryController = require('./discovery.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.use(requireAuth);

router.get(
  '/',
  rateLimiter({ action: 'discovery-feed', max: 120, windowSeconds: 60 }),
  discoveryController.getFeed
);

router.get(
  '/feed',
  rateLimiter({ action: 'discovery-feed', max: 120, windowSeconds: 60 }),
  discoveryController.getFeed
);

module.exports = router;
