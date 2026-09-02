const { query } = require('../../../infrastructure/database/pool');
const campaignsRepo = require('../campaigns/adminCampaigns.repository');

async function listSegments() {
  const res = await query(
    `SELECT s.id, s.name, s.description, s.filters, s.estimated_count AS "estimatedCount",
            s.created_at AS "createdAt", s.updated_at AS "updatedAt",
            au.display_name AS "createdByName"
     FROM admin_segments s
     LEFT JOIN admin_users au ON s.created_by = au.id
     ORDER BY s.created_at DESC`
  );
  return res.rows;
}

async function getSegmentDetail(id) {
  const res = await query(`SELECT * FROM admin_segments WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function createSegment(data, adminId) {
  const count = await campaignsRepo.countAudience('custom', data.filters || {});
  const res = await query(
    `INSERT INTO admin_segments (name, description, filters, estimated_count, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [data.name, data.description || null, JSON.stringify(data.filters || {}), count, adminId]
  );
  return res.rows[0];
}

async function updateSegment(id, data) {
  const updates = ['updated_at = NOW()'];
  const params = [id];

  if (data.name) {
    params.push(data.name);
    updates.push(`name = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    updates.push(`description = $${params.length}`);
  }
  if (data.filters) {
    const count = await campaignsRepo.countAudience('custom', data.filters);
    params.push(JSON.stringify(data.filters));
    updates.push(`filters = $${params.length}`);
    params.push(count);
    updates.push(`estimated_count = $${params.length}`);
  }

  const sql = `UPDATE admin_segments SET ${updates.join(', ')} WHERE id = $1 RETURNING *`;
  const res = await query(sql, params);
  return res.rows[0];
}

async function deleteSegment(id) {
  await query(`DELETE FROM admin_segments WHERE id = $1`, [id]);
}

module.exports = {
  listSegments,
  getSegmentDetail,
  createSegment,
  updateSegment,
  deleteSegment,
};
