const { query, withTransaction } = require('../../../infrastructure/database/pool');

async function listRoles() {
  const [rolesRes, permsRes] = await Promise.all([
    query(`
      SELECT r.id, r.name, r.description, r.is_system AS "isSystem",
             COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions,
             COALESCE(u_cnt.user_count, 0)::int AS "adminCount"
      FROM admin_roles r
      LEFT JOIN admin_role_permissions rp ON r.id = rp.role_id
      LEFT JOIN (
        SELECT role_id, COUNT(*) as user_count FROM admin_user_roles GROUP BY role_id
      ) u_cnt ON r.id = u_cnt.role_id
      GROUP BY r.id, r.name, r.description, r.is_system, u_cnt.user_count
      ORDER BY r.created_at ASC
    `),
    query(`SELECT id, category, description FROM admin_permissions ORDER BY category ASC, id ASC`),
  ]);

  return {
    roles: rolesRes.rows,
    allPermissions: permsRes.rows,
  };
}

async function getRoleDetail(roleId) {
  const res = await query(`
    SELECT r.id, r.name, r.description, r.is_system AS "isSystem",
           COALESCE(array_agg(rp.permission_id) FILTER (WHERE rp.permission_id IS NOT NULL), '{}') as permissions
    FROM admin_roles r
    LEFT JOIN admin_role_permissions rp ON r.id = rp.role_id
    WHERE r.id = $1
    GROUP BY r.id, r.name, r.description, r.is_system
  `, [roleId]);
  return res.rows[0] || null;
}

async function createRole({ id, name, description, permissions = [] }) {
  return withTransaction(async (client) => {
    const roleRes = await client.query(
      `INSERT INTO admin_roles (id, name, description, is_system)
       VALUES ($1, $2, $3, false)
       RETURNING id, name, description, is_system AS "isSystem"`,
      [id.toUpperCase().replace(/\s+/g, '_'), name, description || null]
    );
    const newRole = roleRes.rows[0];

    for (const permId of permissions) {
      await client.query(
        `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [newRole.id, permId]
      );
    }

    return { ...newRole, permissions };
  });
}

async function updateRole(roleId, { name, description, permissions }) {
  return withTransaction(async (client) => {
    if (name || description !== undefined) {
      await client.query(
        `UPDATE admin_roles SET name = COALESCE($1, name), description = COALESCE($2, description), updated_at = NOW() WHERE id = $3`,
        [name, description, roleId]
      );
    }

    if (Array.isArray(permissions)) {
      await client.query(`DELETE FROM admin_role_permissions WHERE role_id = $1`, [roleId]);
      for (const permId of permissions) {
        await client.query(
          `INSERT INTO admin_role_permissions (role_id, permission_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [roleId, permId]
        );
      }
    }

    return getRoleDetail(roleId);
  });
}

module.exports = {
  listRoles,
  getRoleDetail,
  createRole,
  updateRole,
};
