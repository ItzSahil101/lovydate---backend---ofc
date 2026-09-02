const { query } = require('../../../infrastructure/database/pool');

async function listReports({ status, priority, category, assignedAdminId, limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status) {
    if (status === 'open_all') {
      conditions.push(`r.status IN ('open', 'in_review')`);
    } else {
      params.push(status);
      conditions.push(`r.status = $${params.length}`);
    }
  }

  if (priority) {
    params.push(priority);
    conditions.push(`r.priority = $${params.length}`);
  }

  if (category) {
    params.push(category);
    conditions.push(`r.category ILIKE $${params.length}`);
  }

  if (assignedAdminId) {
    params.push(assignedAdminId);
    conditions.push(`r.assigned_admin_id = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`r.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT r.id, r.priority, r.category, r.status, r.reason, r.details,
           r.target_type AS "targetType", r.target_id AS "targetId",
           r.created_at AS "createdAt", r.resolved_at AS "resolvedAt",
           r.resolution_type AS "resolutionType", r.resolution_note AS "resolutionNote",
           r.reported_user_id AS "reportedUserId", r.reporter_user_id AS "reporterUserId",
           p_rep.display_name AS "reportedUserName", u_rep.email AS "reportedUserEmail",
           (SELECT url FROM profile_photos WHERE user_id = r.reported_user_id AND is_primary = true LIMIT 1) AS "reportedUserPhoto",
           p_src.display_name AS "reporterName", u_src.email AS "reporterEmail",
           au.display_name AS "assignedAdminName"
    FROM reports r
    JOIN users u_rep ON r.reported_user_id = u_rep.id
    LEFT JOIN profiles p_rep ON r.reported_user_id = p_rep.user_id
    JOIN users u_src ON r.reporter_user_id = u_src.id
    LEFT JOIN profiles p_src ON r.reporter_user_id = p_src.user_id
    LEFT JOIN admin_users au ON r.assigned_admin_id = au.id
    ${whereClause}
    ORDER BY 
      CASE r.priority 
        WHEN 'critical' THEN 1 
        WHEN 'high' THEN 2 
        WHEN 'medium' THEN 3 
        WHEN 'low' THEN 4 
        ELSE 5 
      END ASC,
      r.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function getReportDetail(reportId) {
  const reportRes = await query(
    `SELECT r.id, r.priority, r.category, r.status, r.reason, r.details,
            r.target_type AS "targetType", r.target_id AS "targetId",
            r.created_at AS "createdAt", r.resolved_at AS "resolvedAt",
            r.resolution_type AS "resolutionType", r.resolution_note AS "resolutionNote",
            r.reported_user_id AS "reportedUserId", r.reporter_user_id AS "reporterUserId",
            r.assigned_admin_id AS "assignedAdminId",
            p_rep.display_name AS "reportedUserName", u_rep.email AS "reportedUserEmail",
            u_rep.status AS "reportedUserStatus", p_rep.gender AS "reportedUserGender",
            p_rep.date_of_birth AS "reportedUserDob", p_rep.bio AS "reportedUserBio",
            p_src.display_name AS "reporterName", u_src.email AS "reporterEmail",
            au.display_name AS "assignedAdminName"
     FROM reports r
     JOIN users u_rep ON r.reported_user_id = u_rep.id
     LEFT JOIN profiles p_rep ON r.reported_user_id = p_rep.user_id
     JOIN users u_src ON r.reporter_user_id = u_src.id
     LEFT JOIN profiles p_src ON r.reporter_user_id = p_src.user_id
     LEFT JOIN admin_users au ON r.assigned_admin_id = au.id
     WHERE r.id = $1`,
    [reportId]
  );

  if (reportRes.rows.length === 0) return null;
  const report = reportRes.rows[0];

  // Fetch evidence / context based on target_type
  let contextData = null;
  if (report.targetType === 'post' && report.targetId) {
    const postRes = await query(
      `SELECT p.id, p.content, p.created_at AS "createdAt",
              COALESCE(array_agg(ph.url) FILTER (WHERE ph.url IS NOT NULL), '{}') AS photos
       FROM posts p
       LEFT JOIN post_photos ph ON p.id = ph.post_id
       WHERE p.id = $1
       GROUP BY p.id, p.content, p.created_at`,
      [report.targetId]
    );
    contextData = { type: 'post', data: postRes.rows[0] || null };
  } else if (report.targetType === 'comment' && report.targetId) {
    const comRes = await query(
      `SELECT id, comment_text AS "commentText", created_at AS "createdAt" FROM post_comments WHERE id = $1`,
      [report.targetId]
    );
    contextData = { type: 'comment', data: comRes.rows[0] || null };
  }

  // Fetch photos of reported user
  const reportedUserPhotos = await query(
    `SELECT id, url, is_primary AS "isPrimary", moderation_status AS "moderationStatus"
     FROM profile_photos WHERE user_id = $1 ORDER BY display_order ASC`,
    [report.reportedUserId]
  );

  // Fetch previous reports against reported user
  const previousReports = await query(
    `SELECT id, category, reason, status, created_at AS "createdAt"
     FROM reports
     WHERE reported_user_id = $1 AND id != $2
     ORDER BY created_at DESC LIMIT 5`,
    [report.reportedUserId, reportId]
  );

  // Fetch previous restrictions
  const previousRestrictions = await query(
    `SELECT id, restriction_type AS "restrictionType", reason, is_active AS "isActive", created_at AS "createdAt"
     FROM user_restrictions
     WHERE user_id = $1
     ORDER BY created_at DESC LIMIT 5`,
    [report.reportedUserId]
  );

  // Fetch internal notes for report
  const notes = await query(
    `SELECT mn.id, mn.note, mn.created_at AS "createdAt", au.display_name AS "adminName"
     FROM moderation_notes mn
     LEFT JOIN admin_users au ON mn.admin_id = au.id
     WHERE mn.entity_type = 'report' AND mn.entity_id = $1
     ORDER BY mn.created_at DESC`,
    [reportId]
  );

  return {
    ...report,
    contextData,
    reportedUserPhotos: reportedUserPhotos.rows,
    previousReports: previousReports.rows,
    previousRestrictions: previousRestrictions.rows,
    notes: notes.rows,
  };
}

async function updateReportStatus(reportId, status, { assignedAdminId, resolutionType, resolutionNote } = {}) {
  const updates = ['status = $2'];
  const params = [reportId, status];

  if (assignedAdminId !== undefined) {
    params.push(assignedAdminId);
    updates.push(`assigned_admin_id = $${params.length}`);
  }
  if (resolutionType !== undefined) {
    params.push(resolutionType);
    updates.push(`resolution_type = $${params.length}`);
  }
  if (resolutionNote !== undefined) {
    params.push(resolutionNote);
    updates.push(`resolution_note = $${params.length}`);
  }
  if (status === 'resolved' || status === 'dismissed') {
    updates.push(`resolved_at = NOW()`);
  }

  const sql = `
    UPDATE reports
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, status, resolution_type AS "resolutionType", resolved_at AS "resolvedAt"
  `;

  const res = await query(sql, params);
  return res.rows[0];
}

async function addReportNote(reportId, note, adminId) {
  const res = await query(
    `INSERT INTO moderation_notes (entity_type, entity_id, note, admin_id)
     VALUES ('report', $1, $2, $3)
     RETURNING id, note, created_at AS "createdAt"`,
    [reportId, note, adminId]
  );
  return res.rows[0];
}

module.exports = {
  listReports,
  getReportDetail,
  updateReportStatus,
  addReportNote,
};
