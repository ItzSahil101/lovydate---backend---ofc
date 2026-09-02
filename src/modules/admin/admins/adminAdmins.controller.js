const adminsService = require('./adminAdmins.service');

async function listAdmins(req, res, next) {
  try {
    const result = await adminsService.listAdmins();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getAdminDetail(req, res, next) {
  try {
    const { adminId } = req.params;
    const result = await adminsService.getAdminDetail(adminId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createAdmin(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminsService.createAdmin(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const { adminId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminsService.updateAdmin(adminId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function disableAdmin(req, res, next) {
  try {
    const { adminId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminsService.disableAdmin(adminId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function enableAdmin(req, res, next) {
  try {
    const { adminId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminsService.enableAdmin(adminId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function revokeAdminSessions(req, res, next) {
  try {
    const { adminId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminsService.revokeAdminSessions(adminId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAdmins,
  getAdminDetail,
  createAdmin,
  updateAdmin,
  disableAdmin,
  enableAdmin,
  revokeAdminSessions,
};
