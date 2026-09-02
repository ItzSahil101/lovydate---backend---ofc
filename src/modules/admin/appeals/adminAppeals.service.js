const appealsRepo = require('./adminAppeals.repository');
const usersRepo = require('../users/adminUsers.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listAppeals(params) {
  return appealsRepo.listAppeals(params);
}

async function getAppealDetail(appealId) {
  const appeal = await appealsRepo.getAppealDetail(appealId);
  if (!appeal) throw new NotFoundError('Appeal not found');
  return appeal;
}

async function approveAppeal({ appealId, note, admin, ipAddress }) {
  if (!note) throw new BadRequestError('Resolution note is required for approving an appeal');

  const appeal = await appealsRepo.getAppealDetail(appealId);
  if (!appeal) throw new NotFoundError('Appeal not found');

  // If appeal was for suspension or restriction, lift it
  if (appeal.restrictionId) {
    await usersRepo.removeRestriction(appeal.restrictionId, appeal.userId);
  } else {
    await usersRepo.unsuspendUser(appeal.userId);
  }

  const updated = await appealsRepo.updateAppeal(appealId, 'approved', note, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'APPEAL_APPROVED',
    targetType: 'appeal',
    targetId: appealId,
    reason: note,
    details: { userId: appeal.userId },
    ipAddress,
  });

  return updated;
}

async function rejectAppeal({ appealId, note, admin, ipAddress }) {
  if (!note) throw new BadRequestError('Resolution note is required for rejecting an appeal');

  const updated = await appealsRepo.updateAppeal(appealId, 'rejected', note, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'APPEAL_REJECTED',
    targetType: 'appeal',
    targetId: appealId,
    reason: note,
    ipAddress,
  });

  return updated;
}

module.exports = {
  listAppeals,
  getAppealDetail,
  approveAppeal,
  rejectAppeal,
};
