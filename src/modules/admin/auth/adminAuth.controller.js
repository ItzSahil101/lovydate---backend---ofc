const adminAuthService = require('./adminAuth.service');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await adminAuthService.login({ email, password, ipAddress, userAgent });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function refresh(req, res, next) {
  try {
    const { refreshToken } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const result = await adminAuthService.refresh({ refreshToken, ipAddress, userAgent });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminAuthService.logout(req.admin.id, req.admin.sessionId, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function logoutAll(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await adminAuthService.logoutAll(req.admin.id, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const result = await adminAuthService.getMe(req.admin.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getSessions(req, res, next) {
  try {
    const result = await adminAuthService.getSessions(req.admin.id);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  try {
    const { sessionId } = req.params;
    const result = await adminAuthService.deleteSession(req.admin.id, sessionId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function changePassword(req, res, next) {
  try {
    const result = await adminAuthService.changePassword({
      adminId: req.admin.id,
      sessionId: req.admin.sessionId,
      currentPassword: req.body.currentPassword,
      newPassword: req.body.newPassword,
      ipAddress: req.ip || req.connection.remoteAddress,
    });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  login,
  refresh,
  logout,
  logoutAll,
  getMe,
  getSessions,
  deleteSession,
  changePassword,
};
