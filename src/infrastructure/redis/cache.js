
const redis = require('./client');

/**
 * Get a cached value. Returns parsed JS object, or null on miss / error.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
async function cacheGet(key) {
  try {
    const raw = await redis.get(key);
    if (raw == null) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Set a cached value with a TTL in seconds.
 * Serialises the value to JSON. Silently swallows Redis errors so a Redis
 * outage never breaks the request path.
 * @param {string} key
 * @param {any} value
 * @param {number} ttlSeconds
 */
async function cacheSet(key, value, ttlSeconds) {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Redis errors must never crash the API
  }
}

/**
 * Delete one or more exact keys.
 * @param {...string} keys
 */
async function cacheDel(...keys) {
  if (!keys.length) return;
  try {
    await redis.del(...keys);
  } catch {
    // ignore
  }
}

/**
 * Delete all keys matching a glob pattern (uses SCAN to avoid blocking).
 * Example pattern: "chat:conv:user:abc123:*"
 * @param {string} pattern
 */
async function cacheDelPattern(pattern) {
  try {
    let cursor = '0';
    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      if (keys.length) {
        await redis.del(...keys);
      }
    } while (cursor !== '0');
  } catch {
    // ignore
  }
}

/**
 * Read-through cache helper.
 * Returns the cached value if present; otherwise calls `loader`, caches the
 * result for `ttlSeconds`, and returns it.
 * If Redis fails at any point the loader result is still returned uncached.
 *
 * @param {string}   key
 * @param {number}   ttlSeconds
 * @param {function(): Promise<any>} loader
 * @returns {Promise<any>}
 */
async function cacheWrap(key, ttlSeconds, loader) {
  const cached = await cacheGet(key);
  if (cached !== null) return cached;

  const result = await loader();

  // Only cache non-null / non-empty results
  if (result !== null && result !== undefined) {
    await cacheSet(key, result, ttlSeconds);
  }

  return result;
}

// ── Key builders (keep naming consistent across services) ──────────────────

const keys = {
  /** All conversations for a user */
  conversations: (userId) => `chat:conversations:${userId}`,

  /** Latest messages page for a conversation (no cursor = first page) */
  messages: (conversationId, userId) =>
    `chat:messages:${conversationId}:${userId}`,

  /** Community feed for a user */
  feed: (userId, limit) => `feed:${userId}:${limit}`,

  /** Global feed (shared across all users, shorter TTL) */
  feedGlobal: (limit) => `feed:global:${limit}`,
};

module.exports = { cacheGet, cacheSet, cacheDel, cacheDelPattern, cacheWrap, keys };
