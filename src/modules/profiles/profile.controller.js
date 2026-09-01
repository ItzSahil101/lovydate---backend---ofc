const profileService = require('./profile.service');
const { success } = require('../../shared/response');

async function getMe(req, res, next) {
  try {
    const profile = await profileService.getMyProfile(req.user.userId);
    return success(res, profile);
  } catch (err) {
    next(err);
  }
}

async function getProfileById(req, res, next) {
  try {
    const profile = await profileService.getPublicProfile(req.params.userId, req.user.userId);
    return success(res, profile);
  } catch (err) {
    next(err);
  }
}

async function getProfileByName(req, res, next) {
  try {
    const profile = await profileService.getProfileByName(req.params.name, req.user.userId);
    return success(res, profile);
  } catch (err) {
    next(err);
  }
}

async function searchProfiles(req, res, next) {
  try {
    const query = req.query.q || '';
    const limit = parseInt(req.query.limit || '20', 10);
    const profiles = await profileService.searchProfiles(query, limit, req.user.userId);
    return success(res, profiles);
  } catch (err) {
    next(err);
  }
}

async function getBatch(req, res, next) {
  try {
    const rawIds = req.query.ids || '';
    const ids = rawIds.split(',').map((id) => id.trim()).filter(Boolean);
    const profiles = await profileService.getProfilesBatch(ids, req.user.userId);
    return success(res, { profiles });
  } catch (err) {
    next(err);
  }
}

async function updateMe(req, res, next) {
  try {
    const updated = await profileService.updateMyProfile(req.user.userId, req.body);
    return success(res, updated);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMe,
  getProfileById,
  getProfileByName,
  searchProfiles,
  getBatch,
  updateMe,
};
