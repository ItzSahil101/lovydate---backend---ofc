const { query } = require('../../../infrastructure/database/pool');

async function listAppeals({ status = 'all', limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`a.status = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`a.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT a.id, a.user_id AS "userId", a.restriction_id AS "restrictionId",
           a.appeal_type AS "appealType", a.reason, a.status, a.resolution_note AS "resolutionNote",
           a.resolved_at AS "resolvedAt", a.created_at AS "createdAt",
           u.email AS "userEmail", p.display_name AS "userName",
           (SELECT url FROM profile_photos WHERE user_id = a.user_id AND is_primary = true LIMIT 1) AS "userPhoto",
           r.restriction_type AS "originalRestrictionType", r.reason AS "originalReason",
           au.display_name AS "assignedAdminName"
    FROM moderation_appeals a
    JOIN users u ON a.user_id = u.id
    LEFT JOIN profiles p ON a.user_id = p.user_id
    LEFT JOIN user_restrictions r ON a.restriction_id = r.id
    LEFT JOIN admin_users au ON a.assigned_admin_id = au.id
    ${whereClause}
    ORDER BY a.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function getAppealDetail(appealId) {
  const res = await query(
    `SELECT a.id, a.user_id AS "userId", a.restriction_id AS "restrictionId",
            a.appeal_type AS "appealType", a.reason, a.status, a.resolution_note AS "resolutionNote",
            a.resolved_at AS "resolvedAt", a.created_at AS "createdAt",
            u.email AS "userEmail", p.display_name AS "userName",
            (SELECT url FROM profile_photos WHERE user_id = a.user_id AND is_primary = true LIMIT 1) AS "userPhoto",
            r.restriction_type AS "originalRestrictionType", r.reason AS "originalReason",
            r.internal_note AS "originalInternalNote", r.created_at AS "originalRestrictionDate",
            au_orig.display_name AS "originalAdminName",
            au.display_name AS "assignedAdminName"
     FROM moderation_appeals a
     JOIN users u ON a.user_id = u.id
     LEFT JOIN profiles p ON a.user_id = p.user_id
     LEFT JOIN user_restrictions r ON a.restriction_id = r.id
     LEFT JOIN admin_users au_orig ON r.admin_id = au_orig.id
     LEFT JOIN admin_users au ON a.assigned_admin_id = au.id
     WHERE a.id = $1`,
    [appealId]
  );
  return res.rows[0] || null;
}

async function updateAppeal(appealId, status, resolutionNote, adminId) {
  const res = await query(
    `UPDATE moderation_appeals
     SET status = $1, resolution_note = $2, assigned_admin_id = $3, resolved_at = NOW(), updated_at = NOW()
     WHERE id = $4
     RETURNING id, user_id AS "userId", restriction_id AS "restrictionId", appeal_type AS "appealType", status`,
    [status, resolutionNote, adminId, appealId]
  );
  return res.rows[0];
}

module.exports = {
  listAppeals,
  getAppealDetail,
  updateAppeal,
};
