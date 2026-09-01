const redis = require('../../infrastructure/redis/client');
const { acquireLock, releaseLock } = require('../../infrastructure/redis/lock');
const { CACHE_KEYS, CACHE_TTL } = require('../../config/constants');
const interestsRepo = require('./interests.repository');

async function getInterests() {
  try {
    const cached = await redis.get(CACHE_KEYS.INTERESTS);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {}

  const lockKey = 'lock:interests:v1';
  const lock = await acquireLock(lockKey, 2000);

  if (!lock) {
    try {
      await new Promise((r) => setTimeout(r, 150));
      const cached = await redis.get(CACHE_KEYS.INTERESTS);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch {}
  }

  try {
    const interests = await interestsRepo.getAllInterests();
    try {
      await redis.set(
        CACHE_KEYS.INTERESTS,
        JSON.stringify(interests),
        'EX',
        CACHE_TTL.INTERESTS_SECONDS
      );
    } catch {}
    return interests;
  } finally {
    if (lock) {
      await releaseLock(lockKey, lock);
    }
  }
}

module.exports = {
  getInterests,
};
