const repliesService = require("./stories.replies.service");
const { success } = require("../../shared/response");

async function createStoryReply(req, res, next) {
  try {
    const reply = await repliesService.createReply(
      req.params.storyId,
      req.user?.userId,
      req.body?.message,
    );

    return success(res, reply, 201);
  } catch (error) {
    return next(error);
  }
}

async function listStoryReplies(req, res, next) {
  try {
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : 50;

    const replies = await repliesService.listReplies(
      req.params.storyId,
      req.user?.userId,
      limit,
    );

    return success(res, replies);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createStoryReply,
  listStoryReplies,
};