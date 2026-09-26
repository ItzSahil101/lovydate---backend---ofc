const express = require('express');
const router = express.Router();
const feedController = require('./feed.controller');
const { requireAuth } = require('../../middleware/auth');

router.use(requireAuth);

router.get(
  '/',
  (req, res, next) => {
    // Feed is shared content — 30 s fresh, serve stale for another 30 s while revalidating.
    res.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=30');
    next();
  },
  feedController.getFeed
);
router.post('/', feedController.createPost);
router.put('/:postId', feedController.updatePost);
router.patch('/:postId', feedController.updatePost);
router.delete('/:postId', feedController.deletePost);
router.post('/:postId/report', feedController.reportPost);
router.post('/:postId/like', feedController.toggleLike);
router.get('/:postId/comments', feedController.getComments);
router.post('/:postId/comments', feedController.addComment);
router.delete('/:postId/comments/:commentId', feedController.deleteComment);

module.exports = router;
