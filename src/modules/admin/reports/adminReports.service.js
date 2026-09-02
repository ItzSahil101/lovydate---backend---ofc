const reportsRepo = require('./adminReports.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listReports(params) {
  return reportsRepo.listReports(params);
}

async function getReportDetail(reportId) {
  const report = await reportsRepo.getReportDetail(reportId);
  if (!report) {
    throw new NotFoundError('Report not found', 'REPORT_NOT_FOUND');
  }
  return report;
}

async function assignReport({ reportId, adminId, admin, ipAddress }) {
  const targetAdminId = adminId || admin.id;
  const updated = await reportsRepo.updateReportStatus(reportId, 'in_review', { assignedAdminId: targetAdminId });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_ASSIGNED',
    targetType: 'report',
    targetId: reportId,
    details: { assignedAdminId: targetAdminId },
    ipAddress,
  });

  return updated;
}

async function markInReview({ reportId, admin, ipAddress }) {
  const updated = await reportsRepo.updateReportStatus(reportId, 'in_review', { assignedAdminId: admin.id });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_IN_REVIEW',
    targetType: 'report',
    targetId: reportId,
    ipAddress,
  });

  return updated;
}

async function dismissReport({ reportId, note, admin, ipAddress }) {
  const updated = await reportsRepo.updateReportStatus(reportId, 'dismissed', {
    resolutionType: 'dismissed',
    resolutionNote: note || 'Report reviewed and dismissed as non-violating.',
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_DISMISSED',
    targetType: 'report',
    targetId: reportId,
    reason: note,
    ipAddress,
  });

  return updated;
}

async function resolveReport({ reportId, resolutionType, resolutionNote, admin, ipAddress }) {
  if (!resolutionType || !resolutionNote) {
    throw new BadRequestError('Resolution type and resolution note are required');
  }

  const updated = await reportsRepo.updateReportStatus(reportId, 'resolved', {
    resolutionType,
    resolutionNote,
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_RESOLVED',
    targetType: 'report',
    targetId: reportId,
    reason: resolutionNote,
    details: { resolutionType },
    ipAddress,
  });

  return updated;
}

async function escalateReport({ reportId, reason, admin, ipAddress }) {
  await reportsRepo.updateReportStatus(reportId, 'in_review', {
    resolutionNote: `Escalated: ${reason || 'Requires senior review'}`,
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_ESCALATED',
    targetType: 'report',
    targetId: reportId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function addNote({ reportId, note, admin, ipAddress }) {
  if (!note || !note.trim()) throw new BadRequestError('Note cannot be empty');
  const record = await reportsRepo.addReportNote(reportId, note.trim(), admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'REPORT_NOTE_ADDED',
    targetType: 'report',
    targetId: reportId,
    details: { noteId: record.id },
    ipAddress,
  });

  return record;
}

module.exports = {
  listReports,
  getReportDetail,
  assignReport,
  markInReview,
  dismissReport,
  resolveReport,
  escalateReport,
  addNote,
};
