const rolesRepo = require('./adminRoles.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listRoles() {
  return rolesRepo.listRoles();
}

async function getRoleDetail(roleId) {
  const role = await rolesRepo.getRoleDetail(roleId);
  if (!role) throw new NotFoundError('Role not found');
  return role;
}

async function createRole(data, admin, ipAddress) {
  if (!data.id || !data.name) throw new BadRequestError('Role ID and name are required');

  const role = await rolesRepo.createRole(data);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ROLE_CREATED',
    targetType: 'role',
    targetId: role.id,
    details: { name: data.name },
    ipAddress,
  });

  return role;
}

async function updateRole(roleId, data, admin, ipAddress) {
  const updated = await rolesRepo.updateRole(roleId, data);
  if (!updated) throw new NotFoundError('Role not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ROLE_UPDATED',
    targetType: 'role',
    targetId: roleId,
    details: data,
    ipAddress,
  });

  return updated;
}

module.exports = {
  listRoles,
  getRoleDetail,
  createRole,
  updateRole,
};
