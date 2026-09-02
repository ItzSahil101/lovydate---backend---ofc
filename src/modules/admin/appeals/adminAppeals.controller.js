const appealsService = require('./adminAppeals.service');

async function listAppeals(req, res, next) {
  try {
    const result = await appealsService.listAppeals(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getAppealDetail(req, res, next) {
  try {
    const { appealId } = req.params;
    const result = await appealsService.getAppealDetail(appealId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function approveAppeal(req, res, next) {
  try {
    const { appealId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await appealsService.approveAppeal({ appealId, note, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function rejectAppeal(req, res, next) {
  try {
    const { appealId } = req.params;
    const { note } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await appealsService.rejectAppeal({ appealId, note, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAppeals,
  getAppealDetail,
  approveAppeal,
  rejectAppeal,
};
