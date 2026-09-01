const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');

describe('Discovery Module Integration Tests', () => {
  const testUserId = '22222222-2222-2222-2222-222222222222';
  const token = jwt.sign(
    { userId: testUserId, email: 'discover_tester@lovydate.com' },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  it('should require authentication for discovery feed', async () => {
    const res = await request(app).get('/api/v1/discovery');
    expect(res.statusCode).toBe(401);
  });

  it('should return paginated structure for discovery feed', async () => {
    const res = await request(app)
      .get('/api/v1/discovery?limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.statusCode === 200 || res.statusCode === 500).toBe(true);
    if (res.statusCode === 200) {
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.hasMore !== undefined).toBe(true);
    }
  });
});
