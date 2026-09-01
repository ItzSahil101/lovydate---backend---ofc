const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { UnauthorizedError } = require('../shared/errors');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication token is required'));
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
    };
    next();
  } catch {
    return next(new UnauthorizedError('Invalid or expired authentication token'));
  }
}

module.exports = { requireAuth };
