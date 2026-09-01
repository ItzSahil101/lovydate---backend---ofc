const likesService = require('./likes.service');
const { success } = require('../../shared/response');

async function likeUser(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const result = await likesService.likeUser(req.user.userId, targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function passUser(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const result = await likesService.passUser(req.user.userId, targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function getStatus(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.query.targetUserId;
    const result = await likesService.getStatus(req.user.userId, targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function unlikeUser(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const result = await likesService.unlikeUser(req.user.userId, targetUserId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  likeUser,
  passUser,
  getStatus,
  unlikeUser,
};
