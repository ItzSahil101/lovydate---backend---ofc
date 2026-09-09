jest.mock('../src/infrastructure/database/pool', () => ({ query: jest.fn() }));
jest.mock('../src/infrastructure/redis/client', () => ({
  set: jest.fn(), get: jest.fn(), del: jest.fn(),
}));
jest.mock('../src/infrastructure/queue/queueManager', () => ({ addJob: jest.fn() }));
jest.mock('../src/infrastructure/email/emailService', () => ({ sendOtpEmail: jest.fn() }));
jest.mock('../src/infrastructure/firebase/fcm', () => ({ verifyFirebaseIdToken: jest.fn() }));
jest.mock('../src/modules/auth/auth.repository', () => ({
  findUserByEmail: jest.fn(),
  createGoogleUser: jest.fn(),
  linkGoogleIdentity: jest.fn(),
  storeRefreshToken: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const { query } = require('../src/infrastructure/database/pool');
const firebase = require('../src/infrastructure/firebase/fcm');
const authRepo = require('../src/modules/auth/auth.repository');
const authService = require('../src/modules/auth/auth.service');
const supportService = require('../src/modules/support/support.service');

describe('production identity boundaries', () => {
  beforeEach(() => jest.clearAllMocks());

  test('Google login rejects an unverifiable client token', async () => {
    firebase.verifyFirebaseIdToken.mockRejectedValue(new Error('invalid'));
    await expect(authService.googleAuth('not-a-real-token')).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_GOOGLE_TOKEN',
    });
    expect(authRepo.findUserByEmail).not.toHaveBeenCalled();
  });

  test('Google login persists the verified provider identity', async () => {
    firebase.verifyFirebaseIdToken.mockResolvedValue({
      uid: 'google-uid-1', email: 'Person@Example.com', email_verified: true, name: 'Person',
    });
    authRepo.findUserByEmail.mockResolvedValue(null);
    authRepo.createGoogleUser.mockResolvedValue({
      id: 'user-1', email: 'person@example.com', google_id: 'google-uid-1', status: 'active',
    });

    const result = await authService.googleAuth('verified-token');

    expect(authRepo.createGoogleUser).toHaveBeenCalledWith({
      email: 'person@example.com', googleId: 'google-uid-1',
    });
    expect(authRepo.storeRefreshToken).toHaveBeenCalledTimes(1);
    expect(result.user.email).toBe('person@example.com');
  });
});

describe('public support ticket access', () => {
  beforeEach(() => jest.clearAllMocks());

  test('new ticket returns a scoped access token', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', subject: 'Help', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'message-1', message: 'Please help' }] });

    const result = await supportService.createPublicTicket({
      name: 'Customer', email: 'customer@example.com', subject: 'Help', message: 'Please help',
    });
    const payload = jwt.decode(result.accessToken);
    expect(payload).toMatchObject({ ticketId: 'ticket-1', purpose: 'support-ticket' });
  });

  test('ticket detail rejects missing access token before database lookup', async () => {
    await expect(supportService.getPublicTicket('ticket-1')).rejects.toMatchObject({
      statusCode: 401,
      code: 'SUPPORT_TOKEN_REQUIRED',
    });
    expect(query).not.toHaveBeenCalled();
  });

  test('ticket access token cannot be reused for another ticket', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', subject: 'Help', status: 'open' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'message-1', message: 'Please help' }] });
    const created = await supportService.createPublicTicket({
      name: 'Customer', email: 'customer@example.com', subject: 'Help', message: 'Please help',
    });
    query.mockClear();

    await expect(supportService.getPublicTicket('ticket-2', created.accessToken)).rejects.toMatchObject({
      statusCode: 401,
      code: 'INVALID_SUPPORT_TOKEN',
    });
    expect(query).not.toHaveBeenCalled();
  });
});
