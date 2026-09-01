const likesService = require('./likes.service');
const { success } = require('../../shared/response');

async function likeUser(req, res, next) {
  try {
    const result = await likesService.likeUser(req.user.userId, req.params.targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function passUser(req, res, next) {
  try {
    const result = await likesService.passUser(req.user.userId, req.params.targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  likeUser,
  passUser,
};
