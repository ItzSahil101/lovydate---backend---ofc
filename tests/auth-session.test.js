jest.mock('../src/config/env', () => ({ jwt: { secret: 'session-test-secret' } }));
jest.mock('../src/infrastructure/database/pool', () => ({ query: jest.fn() }));
jest.mock('../src/infrastructure/redis/client', () => ({}));
jest.mock('../src/infrastructure/queue/queueManager', () => ({}));
jest.mock('../src/infrastructure/firebase/fcm', () => ({ saveDeviceToken: jest.fn() }));

const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const { query } = require('../src/infrastructure/database/pool');
const { saveDeviceToken } = require('../src/infrastructure/firebase/fcm');
const { requireAuth, optionalAuth } = require('../src/middleware/auth');
const { errorHandler } = require('../src/middleware/errorHandler');
const onboardingRoutes = require('../src/modules/onboarding/onboarding.routes');
const notificationRoutes = require('../src/modules/notifications/notifications.routes');

const userId = '078cfb2c-c62d-4097-99ae-98954bdb2d7d';
const activeUser = { id: userId, email: 'current@example.com', status: 'active' };
const tokenFor = (payload = {}, options = {}) => jwt.sign(
  { userId, email: 'old@example.com', ...payload }, 'session-test-secret',
  { expiresIn: '15m', ...options }
);
const app = express();
app.use(express.json());
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.get('/required', requireAuth, (req, res) => res.json(req.user));
app.get('/optional', optionalAuth, (req, res) => res.json({ user: req.user || null }));
app.use(errorHandler);

beforeEach(() => {
  jest.resetAllMocks();
  query.mockResolvedValue({ rows: [] });
});

describe('stale account sessions', () => {
  test.each([
    ['get', '/api/v1/onboarding', undefined],
    ['patch', '/api/v1/onboarding/basic-info', {
      displayName: 'Person', dateOfBirth: '2000-01-01', gender: 'woman',
    }],
    ['post', '/api/v1/notifications/device-token', { deviceToken: 'device-token', platform: 'android' }],
  ])('%s %s rejects a deleted user before any downstream work', async (method, path, body) => {
    const response = await request(app)[method](path)
      .set('Authorization', `Bearer ${tokenFor()}`).send(body);

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('SESSION_INVALID');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FROM users'), [userId]);
    expect(saveDeviceToken).not.toHaveBeenCalled();
  });

  test('a new active account can load and save onboarding before it has a profile', async () => {
    const draft = { displayName: 'Person', dateOfBirth: '2000-01-01', gender: 'woman' };
    query.mockImplementation(async (sql) => {
      if (sql.startsWith('SELECT id, email, status FROM users')) return { rows: [activeUser] };
      if (sql.includes('LEFT JOIN onboarding_progress')) {
        return { rows: [{ onboardingCompleted: false, step: 1, draft_data: {} }] };
      }
      if (sql.includes('INSERT INTO onboarding_progress')) {
        return { rows: [{ step: 1, draft_data: { basicInfo: draft } }] };
      }
      return { rows: [] };
    });

    const progress = await request(app).get('/api/v1/onboarding')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(progress.status).toBe(200);
    expect(progress.body.data).toEqual({ onboardingCompleted: false, step: 1, draftData: {} });

    const saved = await request(app).patch('/api/v1/onboarding/basic-info')
      .set('Authorization', `Bearer ${tokenFor()}`).send(draft);
    expect(saved.status).toBe(200);
    expect(saved.body.data.draftData.basicInfo).toEqual(draft);
  });

  test('activity throttling does not keep a deleted account authenticated', async () => {
    query.mockResolvedValueOnce({ rows: [activeUser] });
    const first = await request(app).get('/required').set('Authorization', `Bearer ${tokenFor()}`);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ userId, email: activeUser.email });

    query.mockClear();
    const deleted = await request(app).get('/required').set('Authorization', `Bearer ${tokenFor()}`);
    expect(deleted.status).toBe(401);
    expect(deleted.body.error.code).toBe('SESSION_INVALID');
    expect(query).toHaveBeenCalledTimes(1);
  });

  test('an inactive account cannot use an otherwise valid access token', async () => {
    query.mockResolvedValue({ rows: [{ ...activeUser, status: 'suspended' }] });
    const response = await request(app).get('/required').set('Authorization', `Bearer ${tokenFor()}`);
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('ACCOUNT_INACTIVE');
    expect(query).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['missing', null],
    ['malformed', 'not-a-token'],
    ['invalid user ID', tokenFor({ userId: 'not-a-uuid' })],
    ['scoped', tokenFor({ purpose: 'support-ticket' })],
    ['expired', tokenFor({}, { expiresIn: -1 })],
    ['wrong signature', jwt.sign({ userId }, 'another-secret')],
  ])('%s credentials are rejected without querying the database', async (_label, token) => {
    const pending = request(app).get('/required');
    if (token) pending.set('Authorization', `Bearer ${token}`);
    const response = await pending;
    expect(response.status).toBe(401);
    expect(query).not.toHaveBeenCalled();
  });

  test.each(['/required', '/optional'])('database failures on %s do not become authentication failures', async (path) => {
    const databaseError = new Error('Database unavailable');
    query.mockRejectedValue(databaseError);
    const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const response = await request(app).get(path).set('Authorization', `Bearer ${tokenFor()}`);
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(log).toHaveBeenCalledWith('Unhandled Server Error:', databaseError);
    } finally {
      log.mockRestore();
    }
  });
});

describe('optional authentication', () => {
  test.each([
    ['missing', null, []],
    ['invalid', 'not-a-token', []],
    ['deleted', tokenFor(), []],
    ['inactive', tokenFor(), [{ ...activeUser, status: 'banned' }]],
  ])('%s sessions remain anonymous on public routes', async (_label, token, rows) => {
    query.mockResolvedValue({ rows });
    const pending = request(app).get('/optional');
    if (token) pending.set('Authorization', `Bearer ${token}`);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(response.body.user).toBeNull();
    expect(query.mock.calls.every(([sql]) => !sql.startsWith('UPDATE'))).toBe(true);
  });

  test('active sessions use the current database identity', async () => {
    query.mockResolvedValue({ rows: [activeUser] });
    const response = await request(app).get('/optional').set('Authorization', `Bearer ${tokenFor()}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({ userId, email: activeUser.email });
  });
});
