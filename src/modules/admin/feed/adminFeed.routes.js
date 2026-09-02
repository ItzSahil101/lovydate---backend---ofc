const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminFeed.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('feed.read'), controller.listFeed);
router.get('/:postId', requirePermission('feed.read'), controller.getPostDetail);
router.post('/:postId/remove', requirePermission('feed.moderate'), controller.removePost);
router.post('/:postId/restore', requirePermission('feed.moderate'), controller.restorePost);
router.post('/:postId/disable-comments', requirePermission('feed.moderate'), controller.disableComments);

module.exports = router;
