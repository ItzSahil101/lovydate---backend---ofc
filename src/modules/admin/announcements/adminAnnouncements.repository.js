const { query } = require('../../../infrastructure/database/pool');

async function listAnnouncements() {
  const res = await query(
    `SELECT a.id, a.title, a.message, a.type, a.image_url AS "imageUrl",
            a.cta_label AS "ctaLabel", a.cta_destination AS "ctaDestination",
            a.audience_type AS "audienceType", a.priority, a.dismissible, a.is_active AS "isActive",
            a.start_date AS "startDate", a.end_date AS "endDate", a.created_at AS "createdAt",
            au.display_name AS "createdByName"
     FROM announcements a
     LEFT JOIN admin_users au ON a.created_by = au.id
     ORDER BY a.priority DESC, a.created_at DESC`
  );
  return res.rows;
}

async function getAnnouncementDetail(id) {
  const res = await query(`SELECT * FROM announcements WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function createAnnouncement(data, adminId) {
  const res = await query(
    `INSERT INTO announcements (
       title, message, type, image_url, cta_label, cta_destination, cta_data,
       audience_type, audience_filters, priority, dismissible, is_active, start_date, end_date, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
     RETURNING *`,
    [
      data.title, data.message, data.type || 'INFO', data.imageUrl || null,
      data.ctaLabel || null, data.ctaDestination || null, JSON.stringify(data.ctaData || {}),
      data.audienceType || 'everyone', JSON.stringify(data.audienceFilters || {}),
      data.priority || 1, data.dismissible !== false, data.isActive !== false,
      data.startDate || new Date(), data.endDate || null, adminId
    ]
  );
  return res.rows[0];
}

async function updateAnnouncement(id, data) {
  const updates = ['updated_at = NOW()'];
  const params = [id];

  if (data.title) {
    params.push(data.title);
    updates.push(`title = $${params.length}`);
  }
  if (data.message) {
    params.push(data.message);
    updates.push(`message = $${params.length}`);
  }
  if (data.type) {
    params.push(data.type);
    updates.push(`type = $${params.length}`);
  }
  if (data.imageUrl !== undefined) {
    params.push(data.imageUrl);
    updates.push(`image_url = $${params.length}`);
  }
  if (data.ctaLabel !== undefined) {
    params.push(data.ctaLabel);
    updates.push(`cta_label = $${params.length}`);
  }
  if (data.ctaDestination !== undefined) {
    params.push(data.ctaDestination);
    updates.push(`cta_destination = $${params.length}`);
  }
  if (data.isActive !== undefined) {
    params.push(Boolean(data.isActive));
    updates.push(`is_active = $${params.length}`);
  }
  if (data.priority !== undefined) {
    params.push(parseInt(data.priority, 10));
    updates.push(`priority = $${params.length}`);
  }

  const sql = `UPDATE announcements SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
  const res = await query(sql, params);
  return res.rows[0];
}

async function deleteAnnouncement(id) {
  await query(`DELETE FROM announcements WHERE id = $1`, [id]);
}

module.exports = {
  listAnnouncements,
  getAnnouncementDetail,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
