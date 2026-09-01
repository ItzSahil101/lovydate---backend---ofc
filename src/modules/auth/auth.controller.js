const authService = require('./auth.service');
const { success } = require('../../shared/response');

async function requestCode(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.requestCode(email, password);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function verifyCode(req, res, next) {
  try {
    const { email, code, password } = req.body;
    const result = await authService.verifyCode(email, code, password);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function requestPasswordReset(req, res, next) {
  try {
    const { email } = req.body;
    const result = await authService.requestPasswordReset(email);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { email, code, newPassword } = req.body;
    const result = await authService.resetPasswordAndLogin(email, code, newPassword);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const result = await authService.refreshToken(req.body.refreshToken);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const result = await authService.logout(req.body.refreshToken, req.user?.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function googleAuth(req, res, next) {
  try {
    const result = await authService.googleAuth(req.body);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requestCode,
  verifyCode,
  requestPasswordReset,
  resetPassword,
  refreshToken,
  logout,
  googleAuth,
};
