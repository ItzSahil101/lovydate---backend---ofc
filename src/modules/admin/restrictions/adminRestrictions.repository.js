const { query } = require('../../../infrastructure/database/pool');

async function listRestrictions({ type, isActive = true, limit = 50, cursor }) {
  const conditions = [];
  const params = [];

  if (isActive !== undefined && isActive !== null) {
    params.push(isActive === 'true' || isActive === true);
    conditions.push(`r.is_active = $${params.length}`);
  }

  if (type) {
    params.push(type);
    conditions.push(`r.restriction_type = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`r.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 50, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT r.id, r.user_id AS "userId", r.restriction_type AS "restrictionType",
           r.reason, r.internal_note AS "internalNote", r.is_active AS "isActive",
           r.expires_at AS "expiresAt", r.created_at AS "createdAt",
           u.email AS "userEmail", p.display_name AS "userName",
           (SELECT url FROM profile_photos WHERE user_id = u.id AND is_primary = true LIMIT 1) AS "userPhoto",
           au.display_name AS "adminName"
    FROM user_restrictions r
    JOIN users u ON r.user_id = u.id
    LEFT JOIN profiles p ON u.id = p.user_id
    LEFT JOIN admin_users au ON r.admin_id = au.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

module.exports = {
  listRestrictions,
};
