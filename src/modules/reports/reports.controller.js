const reportsService = require('./reports.service');
const { success } = require('../../shared/response');

async function reportUser(req, res, next) {
  try {
    const { reason, details } = req.body;
    const result = await reportsService.reportUser(
      req.user.userId,
      req.params.targetUserId || req.body.targetUserId,
      reason,
      details
    );
    return success(res, result, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  reportUser,
};
