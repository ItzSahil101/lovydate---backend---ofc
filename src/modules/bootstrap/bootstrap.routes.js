const express = require('express');
const router = express.Router();
const bootstrapController = require('./bootstrap.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');

router.use(requireAuth);

router.get(
  '/',
  rateLimiter({ action: 'bootstrap', max: 60, windowSeconds: 60 }),
  bootstrapController.getBootstrap
);

module.exports = router;
