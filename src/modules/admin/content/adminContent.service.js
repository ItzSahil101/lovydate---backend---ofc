const contentRepo = require('./adminContent.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { BadRequestError } = require('../../../shared/errors');

async function listFeed(params) {
  return contentRepo.listFeedContent(params);
}

async function listPhotos(params) {
  return contentRepo.listPhotos(params);
}

async function listComments(params) {
  return contentRepo.listComments(params);
}

async function listProfiles(params) {
  return contentRepo.listProfilesPendingReview(params);
}

async function removeContent({ contentType, contentId, reason, admin, ipAddress }) {
  if (!reason) throw new BadRequestError('Reason is required for removing content');
  await contentRepo.updateContentModerationStatus(contentType, contentId, 'removed');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'CONTENT_REMOVED',
    targetType: contentType,
    targetId: contentId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function restoreContent({ contentType, contentId, reason, admin, ipAddress }) {
  await contentRepo.updateContentModerationStatus(contentType, contentId, 'approved');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'CONTENT_RESTORED',
    targetType: contentType,
    targetId: contentId,
    reason,
    ipAddress,
  });

  return { success: true };
}

async function approvePhoto({ photoId, admin, ipAddress }) {
  await contentRepo.updateContentModerationStatus('photo', photoId, 'approved');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'PHOTO_APPROVED',
    targetType: 'photo',
    targetId: photoId,
    ipAddress,
  });

  return { success: true };
}

module.exports = {
  listFeed,
  listPhotos,
  listComments,
  listProfiles,
  removeContent,
  restoreContent,
  approvePhoto,
};
