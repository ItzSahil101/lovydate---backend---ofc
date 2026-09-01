const reportsRepo = require('./reports.repository');
const { BadRequestError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');

async function reportUser(reporterUserId, reportedUserId, reason, details = null) {
  if (!isUuid(reportedUserId)) {
    throw new BadRequestError('A valid reported user is required', 'INVALID_TARGET_USER');
  }
  if (reporterUserId === reportedUserId) {
    throw new BadRequestError('You cannot report yourself', 'SELF_REPORT_NOT_ALLOWED');
  }
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    throw new BadRequestError('Report reason is required', 'REASON_REQUIRED');
  }
  if (reason.length > 255 || (details && details.length > 2000)) {
    throw new BadRequestError('Report details are too long', 'REPORT_TOO_LONG');
  }
  if (details !== null && details !== undefined && typeof details !== 'string') {
    throw new BadRequestError('Report details must be text', 'INVALID_REPORT_DETAILS');
  }

  const report = await reportsRepo.insertReport(
    reporterUserId,
    reportedUserId,
    reason.trim(),
    details
  );

  return {
    reported: true,
    reportId: report.id,
  };
}

module.exports = {
  reportUser,
};
