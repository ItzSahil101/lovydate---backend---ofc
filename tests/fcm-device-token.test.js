jest.mock('../src/infrastructure/database/pool', () => ({ query: jest.fn() }));
jest.mock('firebase-admin/app', () => ({
  initializeApp: jest.fn(),
  cert: jest.fn(),
  getApps: jest.fn(() => []),
}));
jest.mock('firebase-admin/messaging', () => ({ getMessaging: jest.fn() }));
jest.mock('firebase-admin/auth', () => ({ getAuth: jest.fn() }));

const { query } = require('../src/infrastructure/database/pool');
const fcm = require('../src/infrastructure/firebase/fcm');

describe('device token registration failures', () => {
  let consoleError;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  test('saveDeviceToken rejects when the database cannot persist the token', async () => {
    const databaseError = Object.assign(new Error('foreign key constraint violation'), {
      code: '23503',
    });
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(databaseError);

    await expect(
      fcm.saveDeviceToken('missing-user-id', 'device-token', 'android')
    ).rejects.toBe(databaseError);

    expect(query).toHaveBeenCalledTimes(3);
    expect(consoleError).toHaveBeenCalledWith('Error saving device token:', databaseError);
  });

  test('controller delegates a failed save to error handling instead of returning 200', async () => {
    const databaseError = new Error('device token save failed');
    const saveDeviceToken = jest.spyOn(fcm, 'saveDeviceToken').mockRejectedValue(databaseError);
    jest.resetModules();
    jest.doMock('../src/infrastructure/firebase/fcm', () => ({
      ...fcm,
      saveDeviceToken,
    }));
    const { registerDeviceToken } = require('../src/modules/notifications/notifications.controller');
    const req = {
      user: { userId: 'missing-user-id' },
      body: { deviceToken: 'device-token', platform: 'android' },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await registerDeviceToken(req, res, next);

    expect(saveDeviceToken).toHaveBeenCalledWith('missing-user-id', 'device-token', 'android');
    expect(next).toHaveBeenCalledWith(databaseError);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
  });
});
