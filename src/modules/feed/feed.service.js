const feedRepo = require('./feed.repository');
const { BadRequestError } = require('../../shared/errors');

async function getFeed(userId, limit = 20) {
  const posts = await feedRepo.getFeedPosts(userId, limit);
  return posts;
}

async function createPost(userId, data) {
  if (!data.content && (!data.photos || data.photos.length === 0)) {
    throw new BadRequestError('Post must have content or photos');
  }
  return feedRepo.createPost(userId, data);
}

async function updatePost(userId, postId, data) {
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

async function getComments(postId) {
  return feedRepo.getPostComments(postId);
}

async function addComment(userId, postId, commentText) {
  if (!commentText || commentText.trim().length === 0) {
    throw new BadRequestError('Comment cannot be empty');
  }
  return feedRepo.addPostComment(userId, postId, commentText.trim());
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
};
