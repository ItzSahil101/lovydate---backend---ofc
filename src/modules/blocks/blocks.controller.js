async function blockUser(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const result = await blocksService.blockUser(
      req.user.userId,
      targetUserId
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function unblockUser(req, res, next) {
  try {
    const targetUserId = req.params.targetUserId || req.body.targetUserId;
    const result = await blocksService.unblockUser(
      req.user.userId,
      targetUserId
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function getBlockedUsers(req, res, next) {
  try {
    const result = await blocksService.getBlockedUsers(req.user.userId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  blockUser,
  unblockUser,
  getBlockedUsers,
};
