const reportsRepo = require('./reports.repository');
const { BadRequestError } = require('../../shared/errors');

async function reportUser(reporterUserId, reportedUserId, reason, details = null) {
  if (reporterUserId === reportedUserId) {
    throw new BadRequestError('You cannot report yourself', 'SELF_REPORT_NOT_ALLOWED');
  }
  if (!reason) {
    throw new BadRequestError('Report reason is required', 'REASON_REQUIRED');
  }

  const report = await reportsRepo.insertReport(
    reporterUserId,
    reportedUserId,
    reason,
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
