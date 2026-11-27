const reactionsRepo = require('./stories.reactions.repository');
const { BadRequestError } = require('../../shared/errors');
const storiesRepo = require('./stories.repository');
const notificationRepo = require('../notifications/notifications.repository');
const { sendPushToUser } = require('../../infrastructure/firebase/fcm');

const ALLOWED_REACTIONS = new Set([
  'like',
  'love',
  'laugh',
  'wow',
  'sad',
  'angry',
]);

function validateStoryId(storyId) {
  if (
    typeof storyId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyId)
  ) {
    throw new BadRequestError('Invalid story ID', 'INVALID_STORY_ID');
  }
}

async function setReaction(storyId, userId, reaction) {
  validateStoryId(storyId);

  if (!ALLOWED_REACTIONS.has(reaction)) {
    throw new BadRequestError('Invalid story reaction', 'INVALID_REACTION');
  }

  const result = await reactionsRepo.setStoryReaction(
    storyId,
    userId,
    reaction
  );

  if (!result) {
    throw new BadRequestError(
      'Story not found or unavailable',
      'STORY_UNAVAILABLE'
    );
  }

  try {
    const story = await storiesRepo.getStoryForViewer(storyId, userId);

    if (result.isNew && story && story.userId !== userId) {
      const reactionLabels = {
        like: 'liked',
        love: 'loved',
        laugh: 'laughed at',
        wow: 'reacted with surprise to',
        sad: 'reacted sadly to',
        angry: 'reacted angrily to',
      };


      notificationRepo.createNotification({
        recipientId: story.userId,
        senderId: userId,
        type: 'story_reaction',
        entityId: storyId,
        message: `${reactionLabels[reaction]} your story`,
      }).catch(() => {});

      sendPushToUser(story.userId, {
        title: 'New story reaction',
        body: "Someone reacted to your story.",
        data: {
          type: 'story_reaction',
          storyId,
        },
      }).catch(() => {});
    }
  } catch (_) {}

  return result;
}

async function removeReaction(storyId, userId) {
  validateStoryId(storyId);

  const story = await storiesRepo.getStoryForViewer(storyId, userId);

  if (!story) {
    return null;
  }

  return reactionsRepo.removeStoryReaction(storyId, userId);
}

module.exports = {
  setReaction,
  removeReaction,
};


