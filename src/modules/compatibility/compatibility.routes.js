const express = require('express');
const router = express.Router();
const controller = require('./compatibility.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const { saveAnswersSchema } = require('./compatibility.validation');

router.use(requireAuth);

router.get(
  '/questions',
  rateLimiter({ action: 'compatibility-questions', max: 60, windowSeconds: 60 }),
  controller.getQuestions
);

router.get(
  '/me',
  rateLimiter({ action: 'compatibility-me', max: 60, windowSeconds: 60 }),
  controller.getMe
);

router.put(
  '/me',
  rateLimiter({ action: 'compatibility-update', max: 30, windowSeconds: 60 }),
  validate(saveAnswersSchema),
  controller.updateMe
);

router.get(
  '/:userId',
  rateLimiter({ action: 'compatibility-compare', max: 60, windowSeconds: 60 }),
  controller.getCompatibility
);

module.exports = router;
