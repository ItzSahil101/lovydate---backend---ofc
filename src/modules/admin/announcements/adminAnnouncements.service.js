const announcementsRepo = require('./adminAnnouncements.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const { broadcastPushNotification } = require('../../../infrastructure/firebase/fcm');
const { emitToAll } = require('../../../infrastructure/websocket/socketServer');

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

  if (announcement.is_active !== false) {
    // Broadcast via WebSockets & FCM Push Notifications
    emitToAll('announcement:new', {
      id: announcement.id,
      title: announcement.title,
      message: announcement.message,
      type: announcement.type,
      imageUrl: announcement.image_url,
      ctaLabel: announcement.cta_label,
      ctaDestination: announcement.cta_destination,
      priority: announcement.priority,
      dismissible: announcement.dismissible,
      createdAt: announcement.created_at,
    });

    broadcastPushNotification({
      title: announcement.title,
      body: announcement.message,
      data: {
        type: 'announcement',
        announcementId: announcement.id,
        ctaDestination: announcement.cta_destination || 'open_app',
      },
    }).catch(() => {});
  }

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

async function broadcastAnnouncement(id, admin, ipAddress) {
  const announcement = await announcementsRepo.getAnnouncementDetail(id);
  if (!announcement) throw new NotFoundError('Announcement not found');

  emitToAll('announcement:new', {
    id: announcement.id,
    title: announcement.title,
    message: announcement.message,
    type: announcement.type,
    imageUrl: announcement.image_url,
    ctaLabel: announcement.cta_label,
    ctaDestination: announcement.cta_destination,
    priority: announcement.priority,
    dismissible: announcement.dismissible,
    createdAt: announcement.created_at,
  });

  const pushResult = await broadcastPushNotification({
    title: announcement.title,
    body: announcement.message,
    data: {
      type: 'announcement',
      announcementId: announcement.id,
      ctaDestination: announcement.cta_destination || 'open_app',
    },
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'ANNOUNCEMENT_BROADCASTED',
    targetType: 'announcement',
    targetId: id,
    details: { title: announcement.title },
    ipAddress,
  });

  return { success: true, message: `Announcement broadcasted to devices.`, pushResult };
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
  broadcastAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
};
