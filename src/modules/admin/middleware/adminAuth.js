const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../../../config/env');
const { UnauthorizedError, ForbiddenError } = require('../../../shared/errors');
const { query } = require('../../../infrastructure/database/pool');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function requireAdminAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Admin authentication token is required', 'ADMIN_TOKEN_REQUIRED'));
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, env.jwt.secret);
    if (!decoded.adminId || !decoded.type || decoded.type !== 'admin_access') {
      return next(new UnauthorizedError('Invalid admin token payload', 'INVALID_ADMIN_TOKEN'));
    }

    // Verify admin is active in database and fetch permissions
    const adminRes = await query(
      `SELECT a.id, a.email, a.display_name, a.avatar_url, a.status,
              COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') as roles,
              COALESCE(array_agg(DISTINCT rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
       FROM admin_users a
       LEFT JOIN admin_user_roles ur ON a.id = ur.admin_id
       LEFT JOIN admin_role_permissions rp ON ur.role_id = rp.role_id
       WHERE a.id = $1
       GROUP BY a.id, a.email, a.display_name, a.avatar_url, a.status`,
      [decoded.adminId]
    );

    if (adminRes.rows.length === 0) {
      return next(new UnauthorizedError('Admin account not found', 'ADMIN_NOT_FOUND'));
    }

    const admin = adminRes.rows[0];
    if (admin.status !== 'active') {
      return next(new ForbiddenError('Admin account is disabled', 'ADMIN_DISABLED'));
    }

    req.admin = {
      id: admin.id,
      email: admin.email,
      displayName: admin.display_name,
      avatarUrl: admin.avatar_url,
      roles: admin.roles || [],
      permissions: new Set(admin.permissions || []),
      isSuperAdmin: (admin.roles || []).includes('SUPER_ADMIN'),
      sessionId: decoded.sessionId,
      ip: req.ip || req.connection.remoteAddress || req.headers['x-forwarded-for'],
    };

    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    return next(new UnauthorizedError('Invalid or expired admin token', 'ADMIN_TOKEN_EXPIRED'));
  }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.admin) {
      return next(new UnauthorizedError('Admin authentication required'));
    }
    if (req.admin.isSuperAdmin) {
      return next();
    }
    if (req.admin.permissions && req.admin.permissions.has(permission)) {
      return next();
    }
    return next(new ForbiddenError(`Permission '${permission}' is required to perform this action`, 'PERMISSION_DENIED'));
  };
}

module.exports = {
  requireAdminAuth,
  requirePermission,
  hashToken,
};
