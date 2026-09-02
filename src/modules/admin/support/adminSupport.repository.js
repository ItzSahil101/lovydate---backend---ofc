const { query } = require('../../../infrastructure/database/pool');

async function listCases({ status, category, assignedAdminId, limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`sc.status = $${params.length}`);
  }
  if (category) {
    params.push(category);
    conditions.push(`sc.category = $${params.length}`);
  }
  if (assignedAdminId) {
    params.push(assignedAdminId);
    conditions.push(`sc.assigned_admin_id = $${params.length}`);
  }
  if (cursor) {
    params.push(cursor);
    conditions.push(`sc.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT sc.id, sc.user_id AS "userId", sc.subject, sc.category, sc.priority, sc.status,
           sc.created_at AS "createdAt", sc.resolved_at AS "resolvedAt",
           sc.resolution_summary AS "resolutionSummary",
           u.email AS "userEmail", p.display_name AS "userName",
           (SELECT url FROM profile_photos WHERE user_id = sc.user_id AND is_primary = true LIMIT 1) AS "userPhoto",
           au.display_name AS "assignedAdminName"
    FROM support_cases sc
    JOIN users u ON sc.user_id = u.id
    LEFT JOIN profiles p ON sc.user_id = p.user_id
    LEFT JOIN admin_users au ON sc.assigned_admin_id = au.id
    ${whereClause}
    ORDER BY sc.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function getCaseDetail(caseId) {
  const caseRes = await query(
    `SELECT sc.id, sc.user_id AS "userId", sc.subject, sc.category, sc.priority, sc.status,
            sc.assigned_admin_id AS "assignedAdminId",
            sc.created_at AS "createdAt", sc.resolved_at AS "resolvedAt",
            sc.resolution_summary AS "resolutionSummary",
            u.email AS "userEmail", u.status AS "userStatus",
            p.display_name AS "userName", p.gender AS "userGender",
            p.date_of_birth AS "userDob", p.bio AS "userBio",
            loc.city AS "userCity",
            au.display_name AS "assignedAdminName"
     FROM support_cases sc
     JOIN users u ON sc.user_id = u.id
     LEFT JOIN profiles p ON sc.user_id = p.user_id
     LEFT JOIN user_locations loc ON sc.user_id = loc.user_id
     LEFT JOIN admin_users au ON sc.assigned_admin_id = au.id
     WHERE sc.id = $1`,
    [caseId]
  );

  if (caseRes.rows.length === 0) return null;
  const caseItem = caseRes.rows[0];

  const messagesRes = await query(
    `SELECT sm.id, sm.sender_type AS "senderType", sm.sender_id AS "senderId",
            sm.message, sm.attachments, sm.created_at AS "createdAt",
            CASE 
              WHEN sm.sender_type = 'admin' THEN au.display_name 
              ELSE p.display_name 
            END AS "senderName"
     FROM support_messages sm
     LEFT JOIN admin_users au ON sm.sender_type = 'admin' AND sm.sender_id = au.id
     LEFT JOIN profiles p ON sm.sender_type = 'user' AND sm.sender_id = p.user_id
     WHERE sm.case_id = $1
     ORDER BY sm.created_at ASC`,
    [caseId]
  );

  const notesRes = await query(
    `SELECT sn.id, sn.note, sn.created_at AS "createdAt", au.display_name AS "adminName"
     FROM support_internal_notes sn
     LEFT JOIN admin_users au ON sn.admin_id = au.id
     WHERE sn.case_id = $1
     ORDER BY sn.created_at DESC`,
    [caseId]
  );

  return {
    ...caseItem,
    messages: messagesRes.rows,
    internalNotes: notesRes.rows,
  };
}

async function createCase({ userId, subject, category, priority, message, adminId }) {
  const caseRes = await query(
    `INSERT INTO support_cases (user_id, subject, category, priority, status, assigned_admin_id)
     VALUES ($1, $2, $3, $4, 'open', $5)
     RETURNING id, user_id, subject, status, created_at AS "createdAt"`,
    [userId, subject, category || 'General', priority || 'medium', adminId || null]
  );
  const newCase = caseRes.rows[0];

  if (message) {
    await query(
      `INSERT INTO support_messages (case_id, sender_type, sender_id, message)
       VALUES ($1, 'user', $2, $3)`,
      [newCase.id, userId, message]
    );
  }

  return newCase;
}

async function addMessage(caseId, senderType, senderId, message, attachments = []) {
  const res = await query(
    `INSERT INTO support_messages (case_id, sender_type, sender_id, message, attachments)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, sender_type AS "senderType", sender_id AS "senderId", message, created_at AS "createdAt"`,
    [caseId, senderType, senderId, message, JSON.stringify(attachments)]
  );

  await query(`UPDATE support_cases SET updated_at = NOW() WHERE id = $1`, [caseId]);
  return res.rows[0];
}

async function addInternalNote(caseId, note, adminId) {
  const res = await query(
    `INSERT INTO support_internal_notes (case_id, admin_id, note)
     VALUES ($1, $2, $3)
     RETURNING id, note, created_at AS "createdAt"`,
    [caseId, adminId, note]
  );
  return res.rows[0];
}

async function updateCase(caseId, fields) {
  const updates = ['updated_at = NOW()'];
  const params = [caseId];

  if (fields.status) {
    params.push(fields.status);
    updates.push(`status = $${params.length}`);
  }
  if (fields.priority) {
    params.push(fields.priority);
    updates.push(`priority = $${params.length}`);
  }
  if (fields.assignedAdminId !== undefined) {
    params.push(fields.assignedAdminId);
    updates.push(`assigned_admin_id = $${params.length}`);
  }
  if (fields.resolutionSummary !== undefined) {
    params.push(fields.resolutionSummary);
    updates.push(`resolution_summary = $${params.length}`);
    updates.push(`resolved_at = NOW()`);
  }

  const sql = `UPDATE support_cases SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
  const res = await query(sql, params);
  return res.rows[0];
}

module.exports = {
  listCases,
  getCaseDetail,
  createCase,
  addMessage,
  addInternalNote,
  updateCase,
};
