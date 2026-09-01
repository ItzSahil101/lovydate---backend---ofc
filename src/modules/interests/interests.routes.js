const express = require('express');
const router = express.Router();
const interestsController = require('./interests.controller');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.get(
  '/',
  rateLimiter({ action: 'interests-get', max: 120, windowSeconds: 60 }),
  interestsController.getInterests
);

module.exports = router;
