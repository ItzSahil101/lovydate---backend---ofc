const redis = require('../infrastructure/redis/client');
const { CACHE_KEYS } = require('../config/constants');
const { RateLimitError } = require('../shared/errors');

function rateLimiter({ action = 'general', max = 60, windowSeconds = 60 }) {
  return async (req, res, next) => {
    const key = req.user?.userId || req.ip;
    const redisKey = CACHE_KEYS.RATE_LIMIT(key, action);

    try {
      const current = await redis.incr(redisKey);
      if (current === 1) {
        await redis.expire(redisKey, windowSeconds);
      }

      const ttl = await redis.ttl(redisKey);

      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - current));
      res.setHeader('X-RateLimit-Reset', ttl);

      if (current > max) {
        res.setHeader('Retry-After', ttl > 0 ? ttl : windowSeconds);
        return next(new RateLimitError('Rate limit exceeded. Please slow down.', ttl > 0 ? ttl : windowSeconds));
      }

      next();
    } catch {
      next();
    }
  };
}

module.exports = { rateLimiter };
