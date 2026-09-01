const express = require('express');
const router = express.Router();
const onboardingController = require('./onboarding.controller');
const { requireAuth } = require('../../middleware/auth');
const { validate } = require('../../middleware/validate');
const { idempotency } = require('../../middleware/idempotency');
const {
  basicInfoSchema,
  preferencesSchema,
  photosSchema,
  interestsSchema,
  aboutSchema,
  discoverySchema,
} = require('./onboarding.validation');

router.use(requireAuth);

router.get('/', onboardingController.getProgress);

router.patch(
  '/basic-info',
  validate(basicInfoSchema),
  onboardingController.saveBasicInfo
);

router.patch(
  '/preferences',
  validate(preferencesSchema),
  onboardingController.savePreferences
);

router.patch(
  '/photos',
  validate(photosSchema),
  onboardingController.savePhotos
);

router.patch(
  '/interests',
  validate(interestsSchema),
  onboardingController.saveInterests
);

router.patch(
  '/about',
  validate(aboutSchema),
  onboardingController.saveAbout
);

router.patch(
  '/discovery',
  validate(discoverySchema),
  onboardingController.saveDiscovery
);

router.post(
  '/location',
  onboardingController.saveLocation
);

router.post(
  '/complete',
  idempotency(),
  onboardingController.complete
);

module.exports = router;
