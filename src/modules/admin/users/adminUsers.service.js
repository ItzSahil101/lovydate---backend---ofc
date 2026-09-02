const usersRepo = require('./adminUsers.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

const ALLOWED_RESTRICTION_TYPES = new Set([
  'ACCOUNT_SUSPENSION',
  'MESSAGING_DISABLED',
  'FEED_POSTING_DISABLED',
  'PROFILE_REVIEW_REQUIRED',
]);

async function listUsers(params) {
  return usersRepo.listUsers(params);
}

async function getUserDetail(userId) {
  const user = await usersRepo.getUserDetail(userId);
  if (!user) {
    throw new NotFoundError('User not found', 'USER_NOT_FOUND');
  }
  return user;
}

async function getUserActivity(userId) {
  return usersRepo.getUserActivityTimeline(userId);
}

async function getUserModeration(userId) {
  return usersRepo.getUserModerationHistory(userId);
}

async function warnUser({ userId, reason, message, admin, ipAddress }) {
  if (!reason) throw new BadRequestError('Reason is required for warning a user');
  const warning = await usersRepo.addWarning(userId, reason, message || reason, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_WARNED',
    targetType: 'user',
    targetId: userId,
    reason,
    details: { message, warningId: warning.id },
    ipAddress,
  });

  return warning;
}

async function suspendUser({ userId, reason, internalNote, durationDays, admin, ipAddress }) {
  if (!reason) throw new BadRequestError('Reason is required to suspend user');
  
  const expiresAt = durationDays && parseInt(durationDays, 10) > 0
    ? new Date(Date.now() + parseInt(durationDays, 10) * 24 * 60 * 60 * 1000)
    : null;

  const restriction = await usersRepo.addRestriction(
    userId,
    'ACCOUNT_SUSPENSION',
    reason,
    internalNote,
    expiresAt,
    admin.id
  );

  await usersRepo.deleteUserRefreshTokens(userId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_SUSPENDED',
    targetType: 'user',
    targetId: userId,
    reason,
    details: { internalNote, durationDays: durationDays || 'permanent', restrictionId: restriction.id },
    ipAddress,
  });

  return restriction;
}

async function unsuspendUser({ userId, reason, admin, ipAddress }) {
  await usersRepo.unsuspendUser(userId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_UNSUSPENDED',
    targetType: 'user',
    targetId: userId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function addRestriction({ userId, restrictionType, reason, internalNote, durationDays, admin, ipAddress }) {
  if (!restrictionType || !reason) throw new BadRequestError('Restriction type and reason are required');
  if (!ALLOWED_RESTRICTION_TYPES.has(restrictionType)) {
    throw new BadRequestError('Unsupported restriction type', 'INVALID_RESTRICTION_TYPE');
  }

  const expiresAt = durationDays && parseInt(durationDays, 10) > 0
    ? new Date(Date.now() + parseInt(durationDays, 10) * 24 * 60 * 60 * 1000)
    : null;

  const restriction = await usersRepo.addRestriction(
    userId,
    restrictionType,
    reason,
    internalNote,
    expiresAt,
    admin.id
  );

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_RESTRICTION_ADDED',
    targetType: 'user',
    targetId: userId,
    reason,
    details: { restrictionType, internalNote, durationDays },
    ipAddress,
  });

  return restriction;
}

async function removeRestriction({ userId, restrictionId, admin, ipAddress }) {
  await usersRepo.removeRestriction(restrictionId, userId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_RESTRICTION_REMOVED',
    targetType: 'user',
    targetId: userId,
    details: { restrictionId },
    ipAddress,
  });

  return { success: true };
}

async function logoutAllSessions({ userId, admin, ipAddress }) {
  await usersRepo.deleteUserRefreshTokens(userId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_FORCE_LOGOUT_ALL',
    targetType: 'user',
    targetId: userId,
    ipAddress,
  });

  return { success: true };
}

async function deactivateUser({ userId, reason, admin, ipAddress }) {
  if (!reason) throw new BadRequestError('Reason is required to deactivate user');
  await usersRepo.deactivateUser(userId);
  await usersRepo.deleteUserRefreshTokens(userId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_DEACTIVATED',
    targetType: 'user',
    targetId: userId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function addNote({ userId, note, admin, ipAddress }) {
  if (!note || !note.trim()) throw new BadRequestError('Note cannot be empty');
  const record = await usersRepo.addModerationNote('user', userId, note.trim(), admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'USER_MODERATION_NOTE_ADDED',
    targetType: 'user',
    targetId: userId,
    details: { noteId: record.id },
    ipAddress,
  });

  return record;
}

module.exports = {
  listUsers,
  getUserDetail,
  getUserActivity,
  getUserModeration,
  warnUser,
  suspendUser,
  unsuspendUser,
  addRestriction,
  removeRestriction,
  logoutAllSessions,
  deactivateUser,
  addNote,
};
