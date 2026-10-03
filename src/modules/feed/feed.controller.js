const feedService = require('./feed.service');
const { success } = require('../../shared/response');

async function getFeed(req, res, next) {
  try {
    const limit = Math.min(parseInt(req.query.limit || '15', 10), 50);
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);

    const result = await feedService.getFeed(
      req.user.userId,
      limit,
      page
    );

    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function createPost(req, res, next) {
  try {
    const post = await feedService.createPost(req.user.userId, req.body);
    return success(res, post, 201);
  } catch (err) {
    next(err);
  }
}

async function updatePost(req, res, next) {
  try {
    const post = await feedService.updatePost(req.user.userId, req.params.postId, req.body);
    return success(res, post);
  } catch (err) {
    next(err);
  }
}

async function deletePost(req, res, next) {
  try {
    const result = await feedService.deletePost(req.user.userId, req.params.postId);
    return success(res, { deleted: result });
  } catch (err) {
    next(err);
  }
}

async function reportPost(req, res, next) {
  try {
    const result = await feedService.reportPost(req.user.userId, req.params.postId, req.body.reason);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function toggleLike(req, res, next) {
  try {
    const result = await feedService.toggleLike(req.user.userId, req.params.postId);
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

async function getComments(req, res, next) {
  try {
    const comments = await feedService.getComments(req.params.postId, req.user.userId);
    return success(res, comments);
  } catch (err) {
    next(err);
  }
}

async function addComment(req, res, next) {
  try {
    const comment = await feedService.addComment(
      req.user.userId,
      req.params.postId,
      req.body.commentText || req.body.text,
      req.body.parentCommentId || null
    );
    return success(res, comment, 201);
  } catch (err) {
    next(err);
  }
}

async function deleteComment(req, res, next) {
  try {
    await feedService.deleteComment(req.user.userId, req.params.postId, req.params.commentId);
    return success(res, { deleted: true });
  } catch (err) {
    next(err);
  }
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
