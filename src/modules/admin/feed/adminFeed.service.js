const feedRepo = require('./adminFeed.repository');
const contentRepo = require('../content/adminContent.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listFeed(params) {
  return feedRepo.listFeedPosts(params);
}

async function getPostDetail(postId) {
  const post = await feedRepo.getPostDetail(postId);
  if (!post) throw new NotFoundError('Post not found');
  return post;
}

async function removePost({ postId, reason, admin, ipAddress }) {
  if (!reason) throw new BadRequestError('Reason is required');
  await contentRepo.updateContentModerationStatus('post', postId, 'removed');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'FEED_POST_REMOVED',
    targetType: 'post',
    targetId: postId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function restorePost({ postId, reason, admin, ipAddress }) {
  await contentRepo.updateContentModerationStatus('post', postId, 'approved');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'FEED_POST_RESTORED',
    targetType: 'post',
    targetId: postId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function disableComments({ postId, disable = true, admin, ipAddress }) {
  await feedRepo.togglePostComments(postId, disable);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: disable ? 'FEED_COMMENTS_DISABLED' : 'FEED_COMMENTS_ENABLED',
    targetType: 'post',
    targetId: postId,
    ipAddress,
  });

  return { success: true };
}

module.exports = {
  listFeed,
  getPostDetail,
  removePost,
  restorePost,
  disableComments,
};
