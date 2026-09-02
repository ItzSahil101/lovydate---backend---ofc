const supportService = require('./adminSupport.service');

async function listCases(req, res, next) {
  try {
    const result = await supportService.listCases(req.query, req.admin);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getCaseDetail(req, res, next) {
  try {
    const { caseId } = req.params;
    const result = await supportService.getCaseDetail(caseId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createCase(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.createCase(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function replyToCase(req, res, next) {
  try {
    const { caseId } = req.params;
    const { message, attachments } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.replyToCase(caseId, message, attachments, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function assignCase(req, res, next) {
  try {
    const { caseId } = req.params;
    const { assignedAdminId } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.assignCase(caseId, assignedAdminId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function addInternalNote(req, res, next) {
  try {
    const { caseId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.addInternalNote(caseId, note, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function resolveCase(req, res, next) {
  try {
    const { caseId } = req.params;
    const { resolutionSummary } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.resolveCase(caseId, resolutionSummary, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateCase(req, res, next) {
  try {
    const { caseId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await supportService.updateCase(caseId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCases,
  getCaseDetail,
  createCase,
  replyToCase,
  assignCase,
  addInternalNote,
  resolveCase,
  updateCase,
};
