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

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is required'));
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    if (typeof decoded.userId !== 'string' || !decoded.userId || decoded.purpose) {
      throw new Error('Invalid access token scope');
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    touchUserActivity(decoded.userId);
    next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    if (typeof decoded.userId !== 'string' || !decoded.userId || decoded.purpose) {
      throw new Error('Invalid access token scope');
    }
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    touchUserActivity(decoded.userId);
  } catch {
    // Optional auth ignores invalid/expired token
  }
  return next();
}

module.exports = { requireAuth, optionalAuth, touchUserActivity };

