const feedRepo = require('./feed.repository');
const { BadRequestError } = require('../../shared/errors');
const { assertNoRestriction } = require('../../middleware/restrictions');

const FEED_POSTING_DISABLED = 'FEED_POSTING_DISABLED';

async function getFeed(userId, limit = 20) {
  const posts = await feedRepo.getFeedPosts(userId, limit);
  return posts;
}

async function createPost(userId, data) {
  await assertNoRestriction(userId, FEED_POSTING_DISABLED);
  if (!data.content && (!data.photos || data.photos.length === 0)) {
    throw new BadRequestError('Post must have content or photos');
  }
  return feedRepo.createPost(userId, data);
}

async function updatePost(userId, postId, data) {
  await assertNoRestriction(userId, FEED_POSTING_DISABLED);
  if (!data.content && (!data.photos || data.photos.length === 0)) {
    throw new BadRequestError('Post must have content or photos');
  }
  return feedRepo.updatePost(userId, postId, data);
}

async function deletePost(userId, postId) {
  return feedRepo.deletePost(userId, postId);
}

async function reportPost(userId, postId, reason) {
  return feedRepo.reportPost(userId, postId, reason);
}

async function toggleLike(userId, postId) {
  return feedRepo.togglePostLike(userId, postId);
}

async function getComments(postId, userId) {
  return feedRepo.getPostComments(postId, userId);
}

async function addComment(userId, postId, commentText, parentCommentId = null) {
  await assertNoRestriction(userId, FEED_POSTING_DISABLED);
  if (!commentText || commentText.trim().length === 0) {
    throw new BadRequestError('Comment cannot be empty');
  }
  return feedRepo.addPostComment(userId, postId, commentText.trim(), parentCommentId);
}

async function deleteComment(userId, postId, commentId) {
  return feedRepo.deletePostComment(userId, postId, commentId);
}

module.exports = {
  getFeed,
  createPost,
  updatePost,
  deletePost,
  reportPost,
  toggleLike,
  getComments,
  addComment,
  deleteComment,
};
