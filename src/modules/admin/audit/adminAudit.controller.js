const auditService = require('./adminAudit.service');

async function getAuditLogs(req, res, next) {
  try {
    const { limit, cursor, adminId, action, targetType } = req.query;
    const result = await auditService.getAuditLogs({ limit, cursor, adminId, action, targetType });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAuditLogs,
};
