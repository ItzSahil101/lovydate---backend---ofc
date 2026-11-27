const storiesRepo = require('./stories.repository');
const notificationRepo = require('../notifications/notifications.repository');
const { sendPushToUser } = require('../../infrastructure/firebase/fcm');
const { BadRequestError } = require('../../shared/errors');

function validateStoryId(storyId) {
  if (
    typeof storyId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storyId)
  ) {
    throw new BadRequestError('Invalid story ID', 'INVALID_STORY_ID');
  }
}

async function createReply(storyId, userId, message) {
  validateStoryId(storyId);

  if (typeof message !== 'string') {
    throw new BadRequestError('Reply message is required', 'MESSAGE_REQUIRED');
  }

  const cleanMessage = message.trim();

  if (!cleanMessage) {
    throw new BadRequestError('Reply message is required', 'MESSAGE_REQUIRED');
  }

  if (cleanMessage.length > 500) {
    throw new BadRequestError(
      'Reply cannot exceed 500 characters',
      'MESSAGE_TOO_LONG'
    );
  }

  const reply = await storiesRepo.createStoryReply(
    storyId,
    userId,
    cleanMessage
  );

  if (!reply) {
    throw new BadRequestError(
      'Story not found or unavailable',
      'STORY_UNAVAILABLE'
    );
  }

  try {
    const story = await storiesRepo.getStoryForViewer(storyId, userId);

    if (story && story.userId !== userId) {
      Promise.resolve()
        .then(() =>
          notificationRepo.createNotification({
            recipientId: story.userId,
            senderId: userId,
            type: 'story_reply',
            entityId: storyId,
            message: 'Someone replied to your story',
            metadata: {
              storyId,
              replyId: reply.id,
            },
          })
        )
        .catch(() => {});

      Promise.resolve()
        .then(() =>
          sendPushToUser(story.userId, {
            title: 'New story reply',
            body: 'Someone replied to your story.',
            data: {
              type: 'story_reply',
              storyId,
              replyId: reply.id,
            },
          })
        )
        .catch(() => {});
    }
  } catch (_) {}

  return reply;
}

async function listReplies(storyId, userId, limit) {
  validateStoryId(storyId);

  const story = await storiesRepo.getStoryForViewer(storyId, userId);

  if (!story) {
    throw new BadRequestError(
      'Story not found or unavailable',
      'STORY_UNAVAILABLE'
    );
  }

  return storiesRepo.getStoryReplies(storyId, userId, limit);
}

module.exports = {
  createReply,
  listReplies,
};