const redis = require('../../infrastructure/redis/client');
const { CACHE_KEYS, CACHE_TTL, DISCOVERY, QUEUE_NAMES } = require('../../config/constants');
const { addJob } = require('../../infrastructure/queue/queueManager');
const discoveryRepo = require('./discovery.repository');
const profileRepo = require('../profiles/profile.repository');
const { encodeCursor, decodeCursor } = require('../../shared/cursor');

async function generateCandidatePool(userId, filterOverrides = null) {
  let prefs = await discoveryRepo.getUserPreferencesAndLocation(userId);
  if (!prefs) {
    return [];
  }

  if (filterOverrides) {
    if (filterOverrides.gender) {
      prefs.interestedIn = filterOverrides.gender === 'Everyone' ? ['Everyone'] : [filterOverrides.gender];
    }
    if (filterOverrides.minAge) prefs.minAge = parseInt(filterOverrides.minAge, 10);
    if (filterOverrides.maxAge) prefs.maxAge = parseInt(filterOverrides.maxAge, 10);
    if (filterOverrides.maxDistanceKm) prefs.maxDistanceMeters = parseInt(filterOverrides.maxDistanceKm, 10) * 1000;
    if (filterOverrides.relationshipGoal) prefs.relationshipGoal = filterOverrides.relationshipGoal;
    if (filterOverrides.verifiedOnly !== undefined) prefs.verifiedOnly = filterOverrides.verifiedOnly;
    prefs.allowOutsidePreferences = false;
  }

  const candidateIds = await discoveryRepo.findCandidateUserIds(
    userId,
    prefs,
    DISCOVERY.TARGET_CANDIDATE_POOL
  );

  const cacheKey = CACHE_KEYS.DISCOVERY_CANDIDATES(userId);
  try {
    await redis.del(cacheKey);
    if (candidateIds.length > 0) {
      await redis.rpush(cacheKey, ...candidateIds);
      await redis.expire(cacheKey, CACHE_TTL.CANDIDATES_SECONDS);
    }
  } catch {}

  return candidateIds;
}

async function getCandidatesFromPoolOrGenerate(userId, count = 20, filterOverrides = null) {
  if (filterOverrides && Object.keys(filterOverrides).length > 0) {
    const generated = await generateCandidatePool(userId, filterOverrides);
    return generated.slice(0, count);
  }

  const cacheKey = CACHE_KEYS.DISCOVERY_CANDIDATES(userId);
  let candidateIds = [];

  try {
    const remaining = await redis.llen(cacheKey);
    if (remaining <= DISCOVERY.LOW_WATER_MARK) {
      addJob(QUEUE_NAMES.DISCOVERY_REFILL, 'refill', { userId }).catch(() => {});
    }

    if (remaining > 0) {
      const popped = await redis.lrange(cacheKey, 0, count - 1);
      if (popped && popped.length > 0) {
        await redis.ltrim(cacheKey, popped.length, -1);
        candidateIds = popped;
      }
    }
  } catch {}

  if (candidateIds.length === 0) {
    const generated = await generateCandidatePool(userId);
    candidateIds = generated.slice(0, count);
    try {
      if (generated.length > count) {
        await redis.ltrim(cacheKey, count, -1);
      } else {
        await redis.del(cacheKey);
      }
    } catch {}
  }

  return candidateIds;
}

async function getDiscoveryFeed(userId, limit = DISCOVERY.DEFAULT_PAGE_SIZE, cursor = null, filterOverrides = null) {
  const clampedLimit = Math.min(Math.max(1, limit), DISCOVERY.MAX_PAGE_SIZE);
  const decoded = decodeCursor(cursor);
  const offset = decoded ? decoded.offset || 0 : 0;

  const candidateIds = await getCandidatesFromPoolOrGenerate(userId, clampedLimit, filterOverrides);

  if (candidateIds.length === 0) {
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  const profiles = await profileRepo.getProfilesBatch(candidateIds, userId);

  const profileMap = {};
  profiles.forEach((p) => {
    profileMap[p.userId] = p;
  });

  const orderedProfiles = candidateIds
    .map((id) => profileMap[id])
    .filter(Boolean)
    .map((p) => ({
      id: p.userId,
      displayName: p.displayName,
      age: p.age,
      gender: p.gender,
      bio: p.bio || '',
      city: p.city || null,
      distanceKm: p.distanceKm,
      isVerified: p.isVerified === true,
      relationshipGoal: p.relationshipGoal,
      photos: p.photos && p.photos.length > 0 ? p.photos.map((ph) => ph.url || ph) : [],
      interests: p.interests && p.interests.length > 0 ? p.interests.map((i) => i.name || i) : [],
    }));

  orderedProfiles.sort((a, b) => {
    if (a.distanceKm != null && b.distanceKm != null) {
      return a.distanceKm - b.distanceKm;
    }
    if (a.distanceKm != null) return -1;
    if (b.distanceKm != null) return 1;
    return 0;
  });

  const nextOffset = offset + orderedProfiles.length;
  const hasMore = orderedProfiles.length >= clampedLimit;
  const nextCursor = hasMore ? encodeCursor({ offset: nextOffset }) : null;

  return {
    items: orderedProfiles,
    nextCursor,
    hasMore,
  };
}

module.exports = {
  generateCandidatePool,
  getCandidatesFromPoolOrGenerate,
  getDiscoveryFeed,
};
