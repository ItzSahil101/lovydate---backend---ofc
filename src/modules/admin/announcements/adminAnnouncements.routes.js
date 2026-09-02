const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminAnnouncements.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('announcements.read'), controller.listAnnouncements);
router.post('/', requirePermission('announcements.manage'), controller.createAnnouncement);
router.get('/:announcementId', requirePermission('announcements.read'), controller.getAnnouncementDetail);
router.patch('/:announcementId', requirePermission('announcements.manage'), controller.updateAnnouncement);
router.delete('/:announcementId', requirePermission('announcements.manage'), controller.deleteAnnouncement);

module.exports = router;
