const { query } = require('../../../infrastructure/database/pool');

async function logAudit({ adminId, adminEmail, action, targetType, targetId, reason, details = {}, ipAddress }) {
  try {
    const res = await query(
      `INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, reason, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, action, created_at AS "createdAt"`,
      [adminId, adminEmail, action, targetType, targetId, reason || null, JSON.stringify(details), ipAddress || null]
    );
    return res.rows[0];
  } catch (err) {
    console.error('Audit logging failed:', err.message);
    return null;
  }
}

async function getAuditLogs({ limit = 50, cursor = null, adminId = null, action = null, targetType = null }) {
  const conditions = [];
  const params = [];

  if (adminId) {
    params.push(adminId);
    conditions.push(`admin_id = $${params.length}`);
  }
  if (action) {
    params.push(action);
    conditions.push(`action ILIKE $${params.length}`);
  }
  if (targetType) {
    params.push(targetType);
    conditions.push(`target_type = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor);
    conditions.push(`created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(Math.min(parseInt(limit, 10) || 50, 100));

  const sql = `
    SELECT id, admin_id AS "adminId", admin_email AS "adminEmail", action,
           target_type AS "targetType", target_id AS "targetId", reason, details,
           ip_address AS "ipAddress", created_at AS "createdAt"
    FROM admin_audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const nextCursor = res.rows.length === params[params.length - 1]
    ? res.rows[res.rows.length - 1].createdAt
    : null;

  return {
    items: res.rows,
    nextCursor,
  };
}

module.exports = {
  logAudit,
  getAuditLogs,
};
