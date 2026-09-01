const { v4: uuidv4 } = require('uuid');
const redis = require('./client');

async function acquireLock(lockKey, ttlMs = 3000) {
  const lockValue = uuidv4();
  try {
    const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
    if (acquired === 'OK') {
      return lockValue;
    }
    return null;
  } catch {
    return null;
  }
}

async function releaseLock(lockKey, lockValue) {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    await redis.eval(luaScript, 1, lockKey, lockValue);
  } catch {}
}

module.exports = {
  acquireLock,
  releaseLock,
};
