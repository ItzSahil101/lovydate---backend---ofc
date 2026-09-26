const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

let decodedToken;
let userLookupCount = 0;
let storedRefreshToken = null;

const stub = (relativePath, exports) => {
  const id = require.resolve(relativePath);
  require.cache[id] = { id, filename: id, loaded: true, exports };
};

stub('../src/infrastructure/firebase/fcm', {
  verifyFirebaseIdToken: async () => decodedToken,
});
stub('../src/infrastructure/redis/client', {});
stub('../src/infrastructure/queue/queueManager', {
  addJob: async () => {},
});
stub('../src/infrastructure/email/emailService', {});
stub('../src/modules/auth/auth.repository', {
  findUserByEmail: async () => {
    userLookupCount += 1;
    return null;
  },
  createGoogleUser: async ({ email, googleId }) => ({
    id: '00000000-0000-4000-8000-000000000001',
    email,
    google_id: googleId,
    status: 'active',
  }),
  storeRefreshToken: async (userId, tokenHash, expiresAt) => {
    storedRefreshToken = { userId, tokenHash, expiresAt };
  },
});

const authService = require('../src/modules/auth/auth.service');

beforeEach(() => {
  decodedToken = null;
  userLookupCount = 0;
  storedRefreshToken = null;
});

test('Google auth rejects a Firebase token from another sign-in provider', async () => {
  decodedToken = {
    uid: 'firebase-password-user',
    email: 'member@example.test',
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  };

  await assert.rejects(authService.googleAuth('firebase-id-token'), {
    statusCode: 401,
    code: 'INVALID_GOOGLE_PROVIDER',
  });
  assert.equal(userLookupCount, 0);
});

test('Google auth creates an app session for a verified Google identity', async () => {
  decodedToken = {
    uid: 'firebase-google-user',
    email: 'Member@Example.test',
    email_verified: true,
    name: 'Lovy Member',
    firebase: { sign_in_provider: 'google.com' },
  };

  const result = await authService.googleAuth('firebase-id-token');

  assert.equal(result.isNewUser, true);
  assert.equal(result.user.email, 'member@example.test');
  assert.equal(result.user.name, 'Lovy Member');
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(storedRefreshToken.userId, result.user.id);
  assert.equal(storedRefreshToken.tokenHash.length, 64);
});
