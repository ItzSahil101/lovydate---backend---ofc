const announcementsRepo = require('./adminAnnouncements.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listAnnouncements() {
  return announcementsRepo.listAnnouncements();
}

async function getAnnouncementDetail(id) {
  const item = await announcementsRepo.getAnnouncementDetail(id);
  if (!item) throw new NotFoundError('Announcement not found');
  return item;
}

async function createAnnouncement(data, admin, ipAddress) {
  if (!data.title || !data.message) {
    throw new BadRequestError('Announcement title and message are required');
  }

  const announcement = await announcementsRepo.createAnnouncement(data, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ANNOUNCEMENT_CREATED',
    targetType: 'announcement',
    targetId: announcement.id,
    details: { title: data.title },
    ipAddress,
  });

  return announcement;
}

async function updateAnnouncement(id, data, admin, ipAddress) {
  const updated = await announcementsRepo.updateAnnouncement(id, data);
  if (!updated) throw new NotFoundError('Announcement not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ANNOUNCEMENT_UPDATED',
    targetType: 'announcement',
    targetId: id,
    ipAddress,
  });

  return updated;
}

async function deleteAnnouncement(id, admin, ipAddress) {
  await announcementsRepo.deleteAnnouncement(id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ANNOUNCEMENT_DELETED',
    targetType: 'announcement',
    targetId: id,
    ipAddress,
  });

  return { success: true };
}

module.exports = {
  listAnnouncements,
  getAnnouncementDetail,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
