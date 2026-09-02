const { query } = require('../../../infrastructure/database/pool');

async function findByEmail(email) {
  const res = await query(
    `SELECT a.id, a.email, a.password_hash, a.display_name, a.avatar_url, a.status,
            COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') as roles,
            COALESCE(array_agg(DISTINCT rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
     FROM admin_users a
     LEFT JOIN admin_user_roles ur ON a.id = ur.admin_id
     LEFT JOIN admin_role_permissions rp ON ur.role_id = rp.role_id
     WHERE a.email = LOWER($1)
     GROUP BY a.id, a.email, a.password_hash, a.display_name, a.avatar_url, a.status`,
    [email]
  );
  return res.rows[0] || null;
}

async function findById(adminId) {
  const res = await query(
    `SELECT a.id, a.email, a.display_name, a.avatar_url, a.status, a.last_login_at, a.created_at,
            COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') as roles,
            COALESCE(array_agg(DISTINCT rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
     FROM admin_users a
     LEFT JOIN admin_user_roles ur ON a.id = ur.admin_id
     LEFT JOIN admin_role_permissions rp ON ur.role_id = rp.role_id
     WHERE a.id = $1
     GROUP BY a.id, a.email, a.display_name, a.avatar_url, a.status, a.last_login_at, a.created_at`,
    [adminId]
  );
  return res.rows[0] || null;
}

async function findByIdWithPassword(adminId) {
  const res = await query(
    `SELECT id, email, password_hash FROM admin_users WHERE id = $1`,
    [adminId]
  );
  return res.rows[0] || null;
}

async function updateLastLogin(adminId) {
  await query(`UPDATE admin_users SET last_login_at = NOW() WHERE id = $1`, [adminId]);
}

async function createSession(adminId, tokenHash, ipAddress, userAgent, expiresAt) {
  const res = await query(
    `INSERT INTO admin_sessions (admin_id, token_hash, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, admin_id, expires_at`,
    [adminId, tokenHash, ipAddress, userAgent, expiresAt]
  );
  return res.rows[0];
}

async function findSessionByTokenHash(tokenHash) {
  const res = await query(
    `SELECT id, admin_id, expires_at FROM admin_sessions WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function deleteSession(sessionId, adminId) {
  await query(`DELETE FROM admin_sessions WHERE id = $1 AND admin_id = $2`, [sessionId, adminId]);
}

async function deleteAllSessions(adminId) {
  await query(`DELETE FROM admin_sessions WHERE admin_id = $1`, [adminId]);
}

async function listSessions(adminId) {
  const res = await query(
    `SELECT id, ip_address AS "ipAddress", user_agent AS "userAgent", last_active_at AS "lastActiveAt",
            expires_at AS "expiresAt", created_at AS "createdAt"
     FROM admin_sessions
     WHERE admin_id = $1
     ORDER BY created_at DESC`,
    [adminId]
  );
  return res.rows;
}

async function updatePassword(adminId, passwordHash, currentSessionId) {
  await query(
    `UPDATE admin_users SET password_hash = $2, updated_at = NOW() WHERE id = $1`,
    [adminId, passwordHash]
  );
  await query(
    `DELETE FROM admin_sessions WHERE admin_id = $1 AND id != $2`,
    [adminId, currentSessionId]
  );
}

module.exports = {
  findByEmail,
  findById,
  findByIdWithPassword,
  updateLastLogin,
  createSession,
  findSessionByTokenHash,
  deleteSession,
  deleteAllSessions,
  listSessions,
  updatePassword,
};
