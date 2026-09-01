const redis = require('../infrastructure/redis/client');
const { CACHE_KEYS, CACHE_TTL } = require('../config/constants');

function idempotency() {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key || req.method === 'GET' || req.method === 'HEAD') {
      return next();
    }

    const redisKey = CACHE_KEYS.IDEMPOTENCY(key);
    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        const { statusCode, body } = JSON.parse(cached);
        return res.status(statusCode).json(body);
      }

      const originalJson = res.json.bind(res);
      res.json = (body) => {
        redis.set(
          redisKey,
          JSON.stringify({ statusCode: res.statusCode, body }),
          'EX',
          CACHE_TTL.IDEMPOTENCY_SECONDS
        ).catch(() => {});
        return originalJson(body);
      };

      next();
    } catch {
      next();
    }
  };
}

module.exports = { idempotency };
