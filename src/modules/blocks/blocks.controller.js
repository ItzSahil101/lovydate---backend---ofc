const blocksService = require('./blocks.service');
const { success } = require('../../shared/response');

async function blockUser(req, res, next) {
  try {
    const result = await blocksService.blockUser(
      req.user.userId,
      req.params.targetUserId
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function unblockUser(req, res, next) {
  try {
    const result = await blocksService.unblockUser(
      req.user.userId,
      req.params.targetUserId
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  blockUser,
  unblockUser,
};
