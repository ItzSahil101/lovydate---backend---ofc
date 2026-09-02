const express = require('express');
const { optionalAuth, requireAuth } = require('../../middleware/auth');
const controller = require('./announcements.controller');

const router = express.Router();

router.get('/', optionalAuth, controller.getActiveAnnouncements);
router.post('/:announcementId/dismiss', requireAuth, controller.dismissAnnouncement);

module.exports = router;
