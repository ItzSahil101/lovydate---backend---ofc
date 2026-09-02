const announcementsService = require('./announcements.service');

async function getActiveAnnouncements(req, res, next) {
  try {
    const userId = req.user?.userId || null;
    const announcements = await announcementsService.getActiveAnnouncements(userId);
    res.status(200).json({ data: announcements });
  } catch (err) {
    next(err);
  }
}

async function dismissAnnouncement(req, res, next) {
  try {
    const { announcementId } = req.params;
    const userId = req.user?.userId;
    const result = await announcementsService.dismissAnnouncement(announcementId, userId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getActiveAnnouncements,
  dismissAnnouncement,
};
