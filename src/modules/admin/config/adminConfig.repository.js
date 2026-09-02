const { query } = require('../../../infrastructure/database/pool');

async function getAllConfig() {
  const res = await query(
    `SELECT key, value, description, is_public AS "isPublic", category, updated_at AS "updatedAt"
     FROM app_config
     ORDER BY category ASC, key ASC`
  );
  return res.rows;
}

async function getPublicConfig() {
  const res = await query(
    `SELECT key, value FROM app_config WHERE is_public = true`
  );
  const map = {};
  res.rows.forEach(r => {
    map[r.key] = r.value;
  });
  return map;
}

async function updateConfigKey(key, value, adminId) {
  const res = await query(
    `UPDATE app_config
     SET value = $1, updated_by = $2, updated_at = NOW()
     WHERE key = $3
     RETURNING key, value, description, is_public AS "isPublic", category, updated_at AS "updatedAt"`,
    [JSON.stringify(value), adminId, key]
  );
  return res.rows[0] || null;
}

module.exports = {
  getAllConfig,
  getPublicConfig,
  updateConfigKey,
};
