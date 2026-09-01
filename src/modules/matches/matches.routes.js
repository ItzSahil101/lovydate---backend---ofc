const express = require('express');
const router = express.Router();
const matchesController = require('./matches.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.use(requireAuth);

router.get(
  '/summary',
  rateLimiter({ action: 'matches-summary', max: 120, windowSeconds: 60 }),
  matchesController.getMatchesSummary
);

router.get(
  '/',
  rateLimiter({ action: 'matches-list', max: 120, windowSeconds: 60 }),
  matchesController.getMatches
);

router.get(
  '/:id',
  rateLimiter({ action: 'match-view', max: 120, windowSeconds: 60 }),
  matchesController.getMatchById
);

module.exports = router;
