const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const values = new Map();
const redis = {
  async get(key) {
    return values.get(key) ?? null;
  },
  async set(key, value) {
    values.set(key, value);
  },
  async scan(_cursor, _match, pattern) {
    const prefix = pattern.replace('*', '');
    return ['0', [...values.keys()].filter((key) => key.startsWith(prefix))];
  },
  async unlink(...keys) {
    keys.forEach((key) => values.delete(key));
  },
};

const redisPath = require.resolve('../src/infrastructure/redis/client');
require.cache[redisPath] = {
  id: redisPath,
  filename: redisPath,
  loaded: true,
  exports: redis,
};

const adminCache = require('../src/modules/admin/adminCache');

beforeEach(() => values.clear());

test('admin cache stores values and coalesces simultaneous cache misses', async () => {
  let loads = 0;
  const loader = async () => {
    loads += 1;
    return { items: ['cached'] };
  };

  const [first, second] = await Promise.all([
    adminCache.getOrSet('admin:test:list', loader),
    adminCache.getOrSet('admin:test:list', loader),
  ]);
  const third = await adminCache.getOrSet('admin:test:list', loader);

  assert.deepEqual(first, { items: ['cached'] });
  assert.deepEqual(second, first);
  assert.deepEqual(third, first);
  assert.equal(loads, 1);
});

test('admin cache invalidates matching keys only', async () => {
  values.set('admin:users:list:a', '{}');
  values.set('admin:users:list:b', '{}');
  values.set('admin:notifications:stats', '{}');

  await adminCache.deleteByPattern('admin:users:list:*');

  assert.equal(values.has('admin:users:list:a'), false);
  assert.equal(values.has('admin:users:list:b'), false);
  assert.equal(values.has('admin:notifications:stats'), true);
});
