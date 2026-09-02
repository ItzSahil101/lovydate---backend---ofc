const { query } = require('../../../infrastructure/database/pool');

async function listFeatureFlags() {
  const res = await query(
    `SELECT ff.id, ff.key, ff.name, ff.description, ff.is_enabled AS "isEnabled",
            ff.rollout_percentage AS "rolloutPercentage", ff.platforms,
            ff.min_app_version AS "minAppVersion", ff.updated_at AS "updatedAt",
            au.display_name AS "updatedByName"
     FROM feature_flags ff
     LEFT JOIN admin_users au ON ff.updated_by = au.id
     ORDER BY ff.created_at ASC`
  );
  return res.rows;
}

async function getFeatureFlag(id) {
  const res = await query(`SELECT * FROM feature_flags WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

async function createFeatureFlag(data, adminId) {
  const res = await query(
    `INSERT INTO feature_flags (key, name, description, is_enabled, rollout_percentage, platforms, min_app_version, updated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, key, name, description, is_enabled AS "isEnabled", rollout_percentage AS "rolloutPercentage", platforms, min_app_version AS "minAppVersion"`,
    [
      data.key, data.name, data.description || null,
      data.isEnabled !== false, data.rolloutPercentage !== undefined ? parseInt(data.rolloutPercentage, 10) : 100,
      data.platforms || ['android', 'ios', 'web'], data.minAppVersion || null, adminId
    ]
  );
  return res.rows[0];
}

async function updateFeatureFlag(id, data, adminId) {
  const updates = ['updated_by = $2', 'updated_at = NOW()'];
  const params = [id, adminId];

  if (data.name) {
    params.push(data.name);
    updates.push(`name = $${params.length}`);
  }
  if (data.description !== undefined) {
    params.push(data.description);
    updates.push(`description = $${params.length}`);
  }
  if (data.isEnabled !== undefined) {
    params.push(Boolean(data.isEnabled));
    updates.push(`is_enabled = $${params.length}`);
  }
  if (data.rolloutPercentage !== undefined) {
    params.push(parseInt(data.rolloutPercentage, 10));
    updates.push(`rollout_percentage = $${params.length}`);
  }
  if (data.platforms) {
    params.push(data.platforms);
    updates.push(`platforms = $${params.length}`);
  }
  if (data.minAppVersion !== undefined) {
    params.push(data.minAppVersion);
    updates.push(`min_app_version = $${params.length}`);
  }

  const sql = `
    UPDATE feature_flags
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, key, name, description, is_enabled AS "isEnabled", rollout_percentage AS "rolloutPercentage", platforms, min_app_version AS "minAppVersion", updated_at AS "updatedAt"
  `;

  const res = await query(sql, params);
  return res.rows[0];
}

module.exports = {
  listFeatureFlags,
  getFeatureFlag,
  createFeatureFlag,
  updateFeatureFlag,
};
