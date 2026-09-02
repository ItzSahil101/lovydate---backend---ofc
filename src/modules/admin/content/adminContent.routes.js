const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminContent.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/feed', requirePermission('content.read'), controller.listFeed);
router.get('/photos', requirePermission('content.read'), controller.listPhotos);
router.get('/profiles', requirePermission('content.read'), controller.listProfiles);
router.get('/comments', requirePermission('content.read'), controller.listComments);

router.post('/photos/:photoId/approve', requirePermission('content.restore'), controller.approvePhoto);
router.post('/:contentType/:contentId/remove', requirePermission('content.remove'), controller.removeContent);
router.post('/:contentType/:contentId/restore', requirePermission('content.restore'), controller.restoreContent);

module.exports = router;
