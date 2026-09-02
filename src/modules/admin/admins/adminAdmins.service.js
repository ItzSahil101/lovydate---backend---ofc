const bcrypt = require('bcryptjs');
const adminsRepo = require('./adminAdmins.repository');
const adminAuthRepo = require('../auth/adminAuth.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../../../shared/errors');

async function listAdmins() {
  return adminsRepo.listAdmins();
}

async function getAdminDetail(adminId) {
  const admin = await adminsRepo.getAdminDetail(adminId);
  if (!admin) throw new NotFoundError('Admin account not found');
  return admin;
}

async function createAdmin(data, admin, ipAddress) {
  if (!data.email || !data.password || !data.displayName) {
    throw new BadRequestError('Email, password, and display name are required');
  }

  const existing = await adminAuthRepo.findByEmail(data.email);
  if (existing) throw new BadRequestError('An admin account with this email already exists');

  const passwordHash = await bcrypt.hash(data.password, 10);
  const newAdmin = await adminsRepo.createAdmin({
    email: data.email,
    passwordHash,
    displayName: data.displayName,
    roles: data.roles || ['READ_ONLY'],
    assignedBy: admin.id,
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ADMIN_ACCOUNT_CREATED',
    targetType: 'admin_user',
    targetId: newAdmin.id,
    details: { email: data.email, roles: data.roles },
    ipAddress,
  });

  return newAdmin;
}

async function updateAdmin(adminId, data, admin, ipAddress) {
  const existing = await adminsRepo.getAdminDetail(adminId);
  if (!existing) throw new NotFoundError('Admin account not found');

  // Guard against removing last Super Admin
  if (existing.roles.includes('SUPER_ADMIN') && data.roles && !data.roles.includes('SUPER_ADMIN')) {
    const superAdminCount = await adminsRepo.countSuperAdmins();
    if (superAdminCount <= 1) {
      throw new ForbiddenError('Cannot remove the SUPER_ADMIN role from the last active Super Admin');
    }
  }

  const updated = await adminsRepo.updateAdmin(adminId, {
    ...data,
    assignedBy: admin.id,
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ADMIN_ACCOUNT_UPDATED',
    targetType: 'admin_user',
    targetId: adminId,
    details: data,
    ipAddress,
  });

  return updated;
}

async function disableAdmin(adminId, admin, ipAddress) {
  const existing = await adminsRepo.getAdminDetail(adminId);
  if (!existing) throw new NotFoundError('Admin account not found');

  if (existing.roles.includes('SUPER_ADMIN')) {
    const superAdminCount = await adminsRepo.countSuperAdmins();
    if (superAdminCount <= 1) {
      throw new ForbiddenError('Cannot disable the last active Super Admin');
    }
  }

  const updated = await adminsRepo.updateAdmin(adminId, { status: 'disabled', assignedBy: admin.id });
  await adminAuthRepo.deleteAllSessions(adminId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ADMIN_ACCOUNT_DISABLED',
    targetType: 'admin_user',
    targetId: adminId,
    ipAddress,
  });

  return updated;
}

async function enableAdmin(adminId, admin, ipAddress) {
  const updated = await adminsRepo.updateAdmin(adminId, { status: 'active', assignedBy: admin.id });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ADMIN_ACCOUNT_ENABLED',
    targetType: 'admin_user',
    targetId: adminId,
    ipAddress,
  });

  return updated;
}

async function revokeAdminSessions(adminId, admin, ipAddress) {
  await adminAuthRepo.deleteAllSessions(adminId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ADMIN_SESSIONS_REVOKED',
    targetType: 'admin_user',
    targetId: adminId,
    ipAddress,
  });

  return { success: true };
}

module.exports = {
  listAdmins,
  getAdminDetail,
  createAdmin,
  updateAdmin,
  disableAdmin,
  enableAdmin,
  revokeAdminSessions,
};
