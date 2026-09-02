const announcementsService = require('./adminAnnouncements.service');

async function listAnnouncements(req, res, next) {
  try {
    const result = await announcementsService.listAnnouncements();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getAnnouncementDetail(req, res, next) {
  try {
    const { announcementId } = req.params;
    const result = await announcementsService.getAnnouncementDetail(announcementId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createAnnouncement(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await announcementsService.createAnnouncement(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function broadcastAnnouncement(req, res, next) {
  try {
    const { announcementId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await announcementsService.broadcastAnnouncement(announcementId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateAnnouncement(req, res, next) {
  try {
    const { announcementId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await announcementsService.updateAnnouncement(announcementId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteAnnouncement(req, res, next) {
  try {
    const { announcementId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await announcementsService.deleteAnnouncement(announcementId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAnnouncements,
  getAnnouncementDetail,
  createAnnouncement,
  broadcastAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
