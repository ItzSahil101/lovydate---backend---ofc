const { query } = require('../../../infrastructure/database/pool');

async function listInterests() {
  const res = await query(`
    SELECT i.id, i.name, i.category, i.icon_name AS "iconName",
           COALESCE(i.is_active, true) AS "isActive",
           COALESCE(i.sort_order, 0) AS "sortOrder",
           COALESCE(u_cnt.user_count, 0)::int AS "userCount"
    FROM interests i
    LEFT JOIN (
      SELECT interest_id, COUNT(*) AS user_count
      FROM user_interests
      GROUP BY interest_id
    ) u_cnt ON i.id = u_cnt.interest_id
    ORDER BY COALESCE(i.sort_order, 0) ASC, i.category ASC, i.name ASC
  `);
  return res.rows;
}

async function getInterestDetail(id) {
  const res = await query(
    `SELECT i.id, i.name, i.category, i.icon_name AS "iconName",
            COALESCE(i.is_active, true) AS "isActive",
            COALESCE(i.sort_order, 0) AS "sortOrder"
     FROM interests i WHERE i.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function createInterest({ name, category, iconName, sortOrder = 0 }) {
  const res = await query(
    `INSERT INTO interests (name, category, icon_name, is_active, sort_order)
     VALUES ($1, $2, $3, true, $4)
     RETURNING id, name, category, icon_name AS "iconName", is_active AS "isActive", sort_order AS "sortOrder"`,
    [name, category, iconName || 'tag', sortOrder]
  );
  return res.rows[0];
}

async function updateInterest(id, fields) {
  const updates = [];
  const params = [id];

  if (fields.name) {
    params.push(fields.name);
    updates.push(`name = $${params.length}`);
  }
  if (fields.category) {
    params.push(fields.category);
    updates.push(`category = $${params.length}`);
  }
  if (fields.iconName !== undefined) {
    params.push(fields.iconName);
    updates.push(`icon_name = $${params.length}`);
  }
  if (fields.isActive !== undefined) {
    params.push(Boolean(fields.isActive));
    updates.push(`is_active = $${params.length}`);
  }
  if (fields.sortOrder !== undefined) {
    params.push(parseInt(fields.sortOrder, 10));
    updates.push(`sort_order = $${params.length}`);
  }

  if (updates.length === 0) return getInterestDetail(id);

  const sql = `UPDATE interests SET ${updates.join(', ')} WHERE id = $1 RETURNING id, name, category, icon_name AS "iconName", is_active AS "isActive", sort_order AS "sortOrder"`;
  const res = await query(sql, params);
  return res.rows[0];
}

async function setInterestActive(id, isActive) {
  const res = await query(
    `UPDATE interests SET is_active = $1 WHERE id = $2 RETURNING id, is_active AS "isActive"`,
    [isActive, id]
  );
  return res.rows[0];
}

async function reorderInterests(items) {
  for (const item of items) {
    if (item.id && item.sortOrder !== undefined) {
      await query(`UPDATE interests SET sort_order = $1 WHERE id = $2`, [item.sortOrder, item.id]);
    }
  }
}

module.exports = {
  listInterests,
  getInterestDetail,
  createInterest,
  updateInterest,
  setInterestActive,
  reorderInterests,
};
