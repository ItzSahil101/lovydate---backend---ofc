const redis = require('../../infrastructure/redis/client');
const { CACHE_TTL } = require('../../config/constants');

const inFlight = new Map();

async function getOrSet(key, loader, ttlSeconds = CACHE_TTL.ADMIN_SECONDS) {
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached);
  } catch (err) {
    console.warn(`Admin cache read failed for ${key}:`, err.message);
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const pending = Promise.resolve()
    .then(loader)
    .then(async (value) => {
      try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (err) {
        console.warn(`Admin cache write failed for ${key}:`, err.message);
      }
      return value;
    })
    .finally(() => inFlight.delete(key));

  inFlight.set(key, pending);
  return pending;
}

async function deleteByPattern(pattern) {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100
      );
      cursor = nextCursor;
      if (keys.length > 0) await redis.unlink(...keys);
    } while (cursor !== '0');
  } catch (err) {
    console.warn(`Admin cache invalidation failed for ${pattern}:`, err.message);
  }
}

module.exports = { getOrSet, deleteByPattern };
