const { query, withTransaction } = require('../../../infrastructure/database/pool');

async function listAdmins() {
  const res = await query(`
    SELECT a.id, a.email, a.display_name AS "displayName", a.avatar_url AS "avatarUrl",
           a.status, a.last_login_at AS "lastLoginAt", a.created_at AS "createdAt",
           COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') as roles
    FROM admin_users a
    LEFT JOIN admin_user_roles ur ON a.id = ur.admin_id
    GROUP BY a.id, a.email, a.display_name, a.avatar_url, a.status, a.last_login_at, a.created_at
    ORDER BY a.created_at ASC
  `);
  return res.rows;
}

async function getAdminDetail(adminId) {
  const res = await query(`
    SELECT a.id, a.email, a.display_name AS "displayName", a.avatar_url AS "avatarUrl",
           a.status, a.last_login_at AS "lastLoginAt", a.created_at AS "createdAt",
           COALESCE(array_agg(DISTINCT ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') as roles
    FROM admin_users a
    LEFT JOIN admin_user_roles ur ON a.id = ur.admin_id
    WHERE a.id = $1
    GROUP BY a.id, a.email, a.display_name, a.avatar_url, a.status, a.last_login_at, a.created_at
  `, [adminId]);
  return res.rows[0] || null;
}

async function createAdmin({ email, passwordHash, displayName, roles = [], assignedBy }) {
  return withTransaction(async (client) => {
    const res = await client.query(
      `INSERT INTO admin_users (email, password_hash, display_name, status)
       VALUES (LOWER($1), $2, $3, 'active')
       RETURNING id, email, display_name AS "displayName", status, created_at AS "createdAt"`,
      [email, passwordHash, displayName]
    );
    const newAdmin = res.rows[0];

    for (const roleId of roles) {
      await client.query(
        `INSERT INTO admin_user_roles (admin_id, role_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [newAdmin.id, roleId, assignedBy]
      );
    }

    return { ...newAdmin, roles };
  });
}

async function updateAdmin(adminId, { displayName, roles, status, assignedBy }) {
  return withTransaction(async (client) => {
    if (displayName || status) {
      const updates = ['updated_at = NOW()'];
      const params = [adminId];
      if (displayName) {
        params.push(displayName);
        updates.push(`display_name = $${params.length}`);
      }
      if (status) {
        params.push(status);
        updates.push(`status = $${params.length}`);
      }
      await client.query(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = $1`, params);
    }

    if (Array.isArray(roles)) {
      await client.query(`DELETE FROM admin_user_roles WHERE admin_id = $1`, [adminId]);
      for (const roleId of roles) {
        await client.query(
          `INSERT INTO admin_user_roles (admin_id, role_id, assigned_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
          [adminId, roleId, assignedBy]
        );
      }
    }

    return getAdminDetail(adminId);
  });
}

async function countSuperAdmins() {
  const res = await query(
    `SELECT COUNT(DISTINCT a.id) as count
     FROM admin_users a
     JOIN admin_user_roles ur ON a.id = ur.admin_id
     WHERE ur.role_id = 'SUPER_ADMIN' AND a.status = 'active'`
  );
  return parseInt(res.rows[0]?.count || 0, 10);
}

module.exports = {
  listAdmins,
  getAdminDetail,
  createAdmin,
  updateAdmin,
  countSuperAdmins,
};
