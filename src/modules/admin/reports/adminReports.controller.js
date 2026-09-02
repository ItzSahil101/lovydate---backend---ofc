const reportsService = require('./adminReports.service');

async function listReports(req, res, next) {
  try {
    const result = await reportsService.listReports(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getReportDetail(req, res, next) {
  try {
    const { reportId } = req.params;
    const result = await reportsService.getReportDetail(reportId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function assignReport(req, res, next) {
  try {
    const { reportId } = req.params;
    const { adminId } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.assignReport({ reportId, adminId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function markInReview(req, res, next) {
  try {
    const { reportId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.markInReview({ reportId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function dismissReport(req, res, next) {
  try {
    const { reportId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.dismissReport({ reportId, note, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function resolveReport(req, res, next) {
  try {
    const { reportId } = req.params;
    const { resolutionType, resolutionNote } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.resolveReport({ reportId, resolutionType, resolutionNote, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function escalateReport(req, res, next) {
  try {
    const { reportId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.escalateReport({ reportId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function addNote(req, res, next) {
  try {
    const { reportId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await reportsService.addNote({ reportId, note, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
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
