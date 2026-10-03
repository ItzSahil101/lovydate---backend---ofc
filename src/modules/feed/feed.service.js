const feedRepo = require('./feed.repository');
const { BadRequestError } = require('../../shared/errors');
const { assertNoRestriction } = require('../../middleware/restrictions');
const { cacheWrap, cacheDel, cacheDelPattern, keys } = require('../../infrastructure/redis/cache');

const FEED_POSTING_DISABLED = 'FEED_POSTING_DISABLED';

// ── TTLs ──────────────────────────────────────────────────────────────────
// Feed is shared social content — 60 s is safe. A new post/like busts it.
const TTL_FEED = 60;

// ── Invalidation ──────────────────────────────────────────────────────────
// The feed is global (any user can see any post) so when anything changes we
// bust every user's cached feed. We use a key pattern rather than tracking
// individual user keys.
async function _invalidateFeed(userId) {
  await Promise.all([
    // Bust this user's personal feed keys (all limit variants)
    cacheDelPattern(`feed:${userId}:*`),
    // Also bust the global feed cache
    cacheDelPattern('feed:global:*'),
  ]);
}

// ── Public service methods ────────────────────────────────────────────────

async function getFeed(userId, limit = 15, page = 1) {
  return cacheWrap(
    keys.feed(userId, limit, page),
    TTL_FEED,
    async () => {
      const posts = await feedRepo.getFeedPosts(userId, limit, page);

      return {
        items: posts,
        page,
        limit,
        hasMore: posts.length === limit,
      };
    },
  );
}

async function createPost(userId, data) {
  await assertNoRestriction(userId, FEED_POSTING_DISABLED);
  if (!data.content && (!data.photos || data.photos.length === 0)) {
    throw new BadRequestError('Post must have content or photos');
  }
  const post = await feedRepo.createPost(userId, data);
  await _invalidateFeed(userId);
  return post;
}

async function updatePost(userId, postId, data) {
  await assertNoRestriction(userId, FEED_POSTING_DISABLED);
  if (!data.content && (!data.photos || data.photos.length === 0)) {
    throw new BadRequestError('Post must have content or photos');
  }
  const post = await feedRepo.updatePost(userId, postId, data);
  await _invalidateFeed(userId);
  return post;
}

async function deletePost(userId, postId) {
  const result = await feedRepo.deletePost(userId, postId);
  await _invalidateFeed(userId);
  return result;
}

async function reportPost(userId, postId, reason) {
  return feedRepo.reportPost(userId, postId, reason);
}

async function toggleLike(userId, postId) {
  const result = await feedRepo.togglePostLike(userId, postId);
  // Likes change the likesCount visible to everyone — bust the liker's feed.
  await cacheDel(keys.feed(userId, 20), keys.feed(userId, 50));
  return result;
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
