module.exports = {
  CACHE_KEYS: {
    PROFILE: (userId) => `profile:public:${userId}`,
    DISCOVERY_CANDIDATES: (userId) => `discovery:candidates:${userId}`,
    INTERESTS: 'interests:v1',
    OTP: (email) => `otp:${email.toLowerCase()}`,
    RATE_LIMIT: (key, action) => `rate:${key}:${action}`,
    IDEMPOTENCY: (key) => `idempotency:${key}`,
    PRESENCE: (userId) => `presence:${userId}`,
  },
  CACHE_TTL: {
    PROFILE_SECONDS: 600,
    INTERESTS_SECONDS: 86400,
    OTP_SECONDS: 600,
    IDEMPOTENCY_SECONDS: 300,
    PRESENCE_SECONDS: 120,
    CANDIDATES_SECONDS: 1800,
  },
  DISCOVERY: {
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 50,
    TARGET_CANDIDATE_POOL: 100,
    LOW_WATER_MARK: 30,
    BATCH_FETCH_LIMIT: 100,
  },
  QUEUE_NAMES: {
    DISCOVERY_REFILL: 'discovery-refill',
    LOGIN_WARMUP: 'login-warmup',
    NOTIFICATIONS: 'notifications',
  },
  ACCOUNT_STATUS: {
    ACTIVE: 'active',
    PAUSED: 'paused',
    SUSPENDED: 'suspended',
    DELETED: 'deleted',
  },
};
