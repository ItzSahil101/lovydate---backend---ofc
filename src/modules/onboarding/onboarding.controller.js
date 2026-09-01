const onboardingService = require('./onboarding.service');
const { success } = require('../../shared/response');

async function getProgress(req, res, next) {
  try {
    const result = await onboardingService.getProgress(req.user.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function saveBasicInfo(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 1, 'basicInfo', req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function savePreferences(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 2, 'preferences', req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function savePhotos(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 3, 'photos', req.body.photos);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function saveInterests(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 4, 'interests', req.body.interests);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function saveAbout(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 5, 'about', req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function saveDiscovery(req, res, next) {
  try {
    const result = await onboardingService.saveStep(req.user.userId, 6, 'discovery', req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function saveLocation(req, res, next) {
  try {
    const result = await onboardingService.saveLocation(req.user.userId, req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function complete(req, res, next) {
  try {
    const result = await onboardingService.complete(req.user.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getProgress,
  saveBasicInfo,
  savePreferences,
  savePhotos,
  saveInterests,
  saveAbout,
  saveDiscovery,
  saveLocation,
  complete,
};
