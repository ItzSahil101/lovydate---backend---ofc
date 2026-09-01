const onboardingRepo = require('./onboarding.repository');
const { BadRequestError } = require('../../shared/errors');
const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS } = require('../../config/constants');
const { addJob } = require('../../infrastructure/queue/queueManager');
const { QUEUE_NAMES } = require('../../config/constants');

async function getProgress(userId) {
  const progress = await onboardingRepo.getProgress(userId);
  return {
    onboardingCompleted: progress ? Boolean(progress.onboardingCompleted) : false,
    step: progress ? progress.step : 1,
    draftData: progress ? progress.draft_data : {},
  };
}

async function saveStep(userId, step, stepName, stepData) {
  const current = await onboardingRepo.getProgress(userId);
  const draftData = current && current.draft_data ? { ...current.draft_data } : {};
  draftData[stepName] = stepData;

  const updated = await onboardingRepo.updateProgress(userId, step, draftData);
  return {
    step: updated.step,
    draftData: updated.draft_data,
  };
}

async function saveLocation(userId, { latitude, longitude, city, countryCode }) {
  if (latitude == null || longitude == null) {
    throw new BadRequestError('Latitude and longitude are required', 'COORDINATES_REQUIRED');
  }
  return onboardingRepo.updateUserLocation(userId, { latitude, longitude, city, countryCode });
}

async function complete(userId) {
  const progress = await onboardingRepo.getProgress(userId);
  const draft = progress ? progress.draft_data : null;

  if (!draft || !draft.basicInfo) {
    throw new BadRequestError('Basic info is incomplete', 'INCOMPLETE_BASIC_INFO');
  }
  if (!draft.preferences || !draft.preferences.interestedIn || !draft.preferences.relationshipGoal) {
    throw new BadRequestError('Dating preferences are incomplete', 'INCOMPLETE_PREFERENCES');
  }
  if (!draft.photos || draft.photos.length < 2) {
    throw new BadRequestError('At least 2 profile photos are required', 'INCOMPLETE_PHOTOS');
  }
  if (!draft.interests || draft.interests.length < 3 || draft.interests.length > 8) {
    throw new BadRequestError('3 to 8 interests are required', 'INCOMPLETE_INTERESTS');
  }

  if (!draft.discovery) {
    draft.discovery = {
      minAge: 18,
      maxAge: 60,
      maxDistanceMeters: 50000,
      allowOutsidePreferences: true,
    };
  }

  await onboardingRepo.completeOnboarding(userId, draft);

  try {
    await redis.del(CACHE_KEYS.PROFILE(userId));
    await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(userId));
  } catch {}

  addJob(QUEUE_NAMES.DISCOVERY_REFILL, 'refill', { userId }).catch(() => {});
  addJob(QUEUE_NAMES.LOGIN_WARMUP, 'warmup', { userId }).catch(() => {});

  return {
    onboardingCompleted: true,
  };
}

module.exports = {
  getProgress,
  saveStep,
  saveLocation,
  complete,
};
