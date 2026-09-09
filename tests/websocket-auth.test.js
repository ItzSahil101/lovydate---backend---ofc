jest.mock('socket.io', () => ({ Server: jest.fn() }));
jest.mock('../src/middleware/auth', () => ({ authenticateAccessToken: jest.fn() }));
jest.mock('../src/infrastructure/database/pool', () => ({ query: jest.fn() }));
jest.mock('../src/infrastructure/redis/client', () => ({
  set: jest.fn(),
  del: jest.fn(),
}));

const { Server } = require('socket.io');
const { authenticateAccessToken } = require('../src/middleware/auth');
const { UnauthorizedError } = require('../src/shared/errors');
const { initSocketServer } = require('../src/infrastructure/websocket/socketServer');

describe('WebSocket authentication', () => {
  let middleware;

  beforeEach(() => {
    jest.clearAllMocks();
    const io = {
      use: jest.fn((handler) => { middleware = handler; }),
      on: jest.fn(),
    };
    Server.mockImplementation(() => io);
    initSocketServer({});
  });

  function authenticate(socket) {
    return new Promise((resolve) => {
      middleware(socket, (error) => resolve(error));
    });
  }

  test('rejects a connection without a token', async () => {
    const error = await authenticate({ handshake: { auth: {}, headers: {} } });

    expect(error).toMatchObject({ message: 'AUTHENTICATION_REQUIRED' });
    expect(authenticateAccessToken).not.toHaveBeenCalled();
  });

  test.each([
    ['missing', 'SESSION_INVALID'],
    ['inactive', 'ACCOUNT_INACTIVE'],
  ])('rejects a token for a %s user', async (_state, code) => {
    authenticateAccessToken.mockRejectedValue(new UnauthorizedError('Rejected', code));
    const socket = { handshake: { auth: { token: 'signed-token' }, headers: {} } };

    const error = await authenticate(socket);

    expect(error).toMatchObject({ message: 'INVALID_TOKEN' });
    expect(socket.userId).toBeUndefined();
  });

  test('accepts an active user and records the database-backed identity', async () => {
    authenticateAccessToken.mockResolvedValue({
      userId: '078cfb2c-c62d-4097-99ae-98954bdb2d7d',
      email: 'person@example.com',
    });
    const socket = { handshake: { auth: {}, headers: { authorization: 'Bearer signed-token' } } };

    const error = await authenticate(socket);

    expect(error).toBeUndefined();
    expect(authenticateAccessToken).toHaveBeenCalledWith('signed-token');
    expect(socket.userId).toBe('078cfb2c-c62d-4097-99ae-98954bdb2d7d');
  });

  test('distinguishes an identity-store failure from an invalid token', async () => {
    authenticateAccessToken.mockRejectedValue(new Error('database unavailable'));
    const socket = { handshake: { auth: { token: 'signed-token' }, headers: {} } };

    const error = await authenticate(socket);

    expect(error).toMatchObject({ message: 'AUTHENTICATION_UNAVAILABLE' });
    expect(socket.userId).toBeUndefined();
  });
});
