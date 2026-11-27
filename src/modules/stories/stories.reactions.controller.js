const reactionsService = require('./stories.reactions.service');
const { success } = require('../../shared/response');
const { BadRequestError } = require('../../shared/errors');

async function setStoryReaction(req, res, next) {
  try {
    const { storyId } = req.params;
    const userId = req.user?.userId;
    const { reaction } = req.body || {};

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
      throw new BadRequestError('Invalid story ID', 'INVALID_STORY_ID');
    }

    const result = await reactionsService.setReaction(
      storyId,
      userId,
      reaction
    );

    return success(res, result);
  } catch (error) {
    return next(error);
  }
}

async function removeStoryReaction(req, res, next) {
  try {
    const { storyId } = req.params;
    const userId = req.user?.userId;

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storyId)) {
      throw new BadRequestError('Invalid story ID', 'INVALID_STORY_ID');
    }

    const result = await reactionsService.removeReaction(storyId, userId);

    return success(res, {
      removed: Boolean(result),
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  setStoryReaction,
  removeStoryReaction,
};
