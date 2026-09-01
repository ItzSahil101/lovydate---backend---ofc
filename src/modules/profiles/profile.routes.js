const express = require('express');
const router = express.Router();
const profileController = require('./profile.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { validate } = require('../../middleware/validate');
const { profilePatchSchema } = require('./profile.validation');

router.use(requireAuth);

router.get('/me', profileController.getMe);
router.patch('/me', validate(profilePatchSchema), profileController.updateMe);
router.get(
  '/',
  rateLimiter({ action: 'profiles-batch', max: 60, windowSeconds: 60 }),
  profileController.getBatch
);
router.get(
  '/:userId',
  rateLimiter({ action: 'profile-view', max: 120, windowSeconds: 60 }),
  profileController.getProfileById
);

module.exports = router;
