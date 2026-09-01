const express = require('express');
const router = express.Router();
const reportsController = require('./reports.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.use(requireAuth);

router.post(
  '/:targetUserId/report',
  rateLimiter({ action: 'report', max: 30, windowSeconds: 60 }),
  reportsController.reportUser
);

module.exports = router;
