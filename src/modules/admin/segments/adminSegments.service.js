const segmentsRepo = require('./adminSegments.repository');
const campaignsRepo = require('../campaigns/adminCampaigns.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

async function listSegments() {
  return segmentsRepo.listSegments();
}

async function getSegmentDetail(id) {
  const segment = await segmentsRepo.getSegmentDetail(id);
  if (!segment) throw new NotFoundError('Segment not found');
  return segment;
}

async function createSegment(data, admin, ipAddress) {
  if (!data.name) throw new BadRequestError('Segment name is required');
  const segment = await segmentsRepo.createSegment(data, admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SEGMENT_CREATED',
    targetType: 'segment',
    targetId: segment.id,
    details: { name: data.name },
    ipAddress,
  });

  return segment;
}

async function updateSegment(id, data, admin, ipAddress) {
  const updated = await segmentsRepo.updateSegment(id, data);
  if (!updated) throw new NotFoundError('Segment not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SEGMENT_UPDATED',
    targetType: 'segment',
    targetId: id,
    ipAddress,
  });

  return updated;
}

async function deleteSegment(id, admin, ipAddress) {
  await segmentsRepo.deleteSegment(id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SEGMENT_DELETED',
    targetType: 'segment',
    targetId: id,
    ipAddress,
  });

  return { success: true };
}

async function estimateSegment(filters, audienceType = 'custom') {
  const count = await campaignsRepo.countAudience(audienceType, filters || {});
  return { estimatedCount: count, estimatedAudience: count };
}

module.exports = {
  listSegments,
  getSegmentDetail,
  createSegment,
  updateSegment,
  deleteSegment,
  estimateSegment,
};
