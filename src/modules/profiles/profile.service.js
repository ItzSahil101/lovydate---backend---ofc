const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS, CACHE_TTL } = require('../../config/constants');
const profileRepo = require('./profile.repository');
const { NotFoundError } = require('../../shared/errors');

async function getPublicProfile(userId) {
  const cacheKey = CACHE_KEYS.PROFILE(userId);
  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  const profile = await profileRepo.getProfileByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  const publicData = {
    id: profile.userId,
    displayName: profile.displayName,
    age: profile.age,
    gender: profile.gender,
    relationshipGoal: profile.relationshipGoal,
    bio: profile.bio || '',
    city: profile.city || null,
    photos: profile.photos || [],
    interests: profile.interests || [],
  };

  try {
    await redis.set(
      cacheKey,
      JSON.stringify(publicData),
      'EX',
      CACHE_TTL.PROFILE_SECONDS
    );
  } catch {}

  return publicData;
}

async function getMyProfile(userId) {
  const profile = await profileRepo.getProfileByUserId(userId);
  if (!profile) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }
  return profile;
}

async function getProfilesBatch(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const clampedIds = ids.slice(0, 50);
  return profileRepo.getProfilesBatch(clampedIds);
}

async function updateMyProfile(userId, patch) {
  const updated = await profileRepo.updateProfile(userId, patch);
  if (!updated) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  await redis.del(CACHE_KEYS.PROFILE(userId));
  await redis.del(CACHE_KEYS.DISCOVERY_CANDIDATES(userId));

  return updated;
}

async function searchProfiles(searchTerm, limit = 20) {
  return profileRepo.searchProfiles(searchTerm, limit);
}

async function getProfileByName(displayName) {
  const profile = await profileRepo.getProfileByName(displayName);
  if (!profile) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }
  return {
    id: profile.userId,
    displayName: profile.displayName,
    age: profile.age,
    gender: profile.gender,
    relationshipGoal: profile.relationshipGoal,
    bio: profile.bio || '',
    city: profile.city || null,
    photos: profile.photos || [],
    interests: profile.interests || [],
  };
}

module.exports = {
  getPublicProfile,
  getMyProfile,
  getProfilesBatch,
  updateMyProfile,
  searchProfiles,
  getProfileByName,
};
