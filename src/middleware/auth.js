const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError } = require('../shared/errors');
const { query } = require('../infrastructure/database/pool');

const lastActiveCache = new Map();
const THROTTLE_MS = 60 * 1000; // update at most once per 60 seconds

function touchUserActivity(userId) {
  if (!userId) return;
  const now = Date.now();
  const last = lastActiveCache.get(userId) || 0;
  if (now - last > THROTTLE_MS) {
    lastActiveCache.set(userId, now);
    query('UPDATE profiles SET last_active_at = NOW() WHERE user_id = $1', [userId]).catch(() => {});
    // Prevent memory leaks in long-running processes
    if (lastActiveCache.size > 10000) {
      const oldestKeys = Array.from(lastActiveCache.keys()).slice(0, 2000);
      for (const k of oldestKeys) lastActiveCache.delete(k);
    }
  }
}

async function authenticateAccessToken(token) {
  let decoded;
  try {
    decoded = jwt.verify(token, env.jwt.secret);
    if (
      typeof decoded.userId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decoded.userId) ||
      decoded.purpose
    ) {
      throw new Error('Invalid access token scope');
    }
  } catch {
    throw new UnauthorizedError('Invalid or expired authentication token');
  }

  // A signed token can outlive its account (for example, after a database reset).
  // Check the database on each request; cached activity is not proof of identity.
  const result = await query(
    'SELECT id, email, status, auth_revoked_at FROM users WHERE id = $1',
    [decoded.userId]
  );
  const user = result.rows[0];
  if (!user) {
    throw new UnauthorizedError('Your session is no longer valid. Please sign in again.', 'SESSION_INVALID');
  }
  if (user.status !== 'active') {
    throw new UnauthorizedError('User account is not active', 'ACCOUNT_INACTIVE');
  }
  if (user.auth_revoked_at && (!decoded.iat || decoded.iat * 1000 <= new Date(user.auth_revoked_at).getTime())) {
    throw new UnauthorizedError('Your session was revoked. Please sign in again.', 'SESSION_REVOKED');
  }

  return { userId: user.id, email: user.email };
}

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is required'));
  }

  const token = authHeader.substring(7);
  try {
    req.user = await authenticateAccessToken(token);
    touchUserActivity(req.user.userId);
  } catch (err) {
    return next(err);
  }
  return next();
}

async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  try {
    req.user = await authenticateAccessToken(token);
    touchUserActivity(req.user.userId);
  } catch (err) {
    // Invalid sessions are anonymous on public routes; database failures are not.
    if (!(err instanceof UnauthorizedError)) return next(err);
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, touchUserActivity, authenticateAccessToken };
