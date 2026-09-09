const campaignsRepo = require('./adminCampaigns.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError, AppError } = require('../../../shared/errors');
const { broadcastPushNotification } = require('../../../infrastructure/firebase/fcm');
const { emitToUser } = require('../../../infrastructure/websocket/socketServer');
const { query } = require('../../../infrastructure/database/pool');
const { notificationsQueue } = require('../../../infrastructure/queue/queueManager');

async function listCampaigns(params) {
  return campaignsRepo.listCampaigns(params);
}

async function getCampaignDetail(campaignId) {
  const campaign = await campaignsRepo.getCampaignDetail(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');
  return campaign;
}

async function createCampaign(data, admin, ipAddress) {
  if (!data.name || !data.title || !data.body) {
    throw new BadRequestError('Campaign name, title, and body are required');
  }

  const campaign = await campaignsRepo.createCampaign({
    ...data,
    adminId: admin.id,
  });


  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'CAMPAIGN_CREATED',
    targetType: 'campaign',
    targetId: campaign.id,
    details: { name: data.name, title: data.title, status: campaign.status },
    ipAddress,
  });

  if (data.status === 'SENT') return sendCampaign({ campaignId: campaign.id, admin, ipAddress });
  if (data.status === 'SCHEDULED') return scheduleCampaign({ campaignId: campaign.id, scheduledAt: data.scheduledAt, admin, ipAddress });
  return campaignsRepo.getCampaignDetail(campaign.id);
}

async function updateCampaign(campaignId, data, admin, ipAddress) {
  const existing = await campaignsRepo.getCampaignDetail(campaignId);
  if (!existing) throw new NotFoundError('Campaign not found');
  if (existing.status === 'SENT' || existing.status === 'SENDING') {
    throw new BadRequestError('Cannot modify a campaign that is already sent or sending');
  }

  if (existing.status === 'SCHEDULED') throw new BadRequestError('Cancel the schedule before editing this campaign');
  const editable = {};
  for (const key of ['name', 'title', 'body', 'imageKey', 'destinationType', 'destinationData', 'audienceType', 'audienceFilters']) {
    if (data[key] !== undefined) editable[key] = data[key];
  }
  const updated = await campaignsRepo.updateCampaign(campaignId, editable);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'CAMPAIGN_UPDATED',
    targetType: 'campaign',
    targetId: campaignId,
    ipAddress,
  });

  return updated;
}

async function deleteCampaign(campaignId, admin, ipAddress) {
  const existing = await campaignsRepo.getCampaignDetail(campaignId);
  if (!existing) throw new NotFoundError('Campaign not found');

  const deleted = await campaignsRepo.deleteCampaign(campaignId);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'CAMPAIGN_DELETED',
    targetType: 'campaign',
    targetId: campaignId,
    details: { name: existing.name, status: existing.status },
    ipAddress,
  });

  return { success: true, id: campaignId };
}

async function estimateAudience(campaignId, filters) {
  let audienceType = 'everyone';
  let audienceFilters = filters || {};

  if (campaignId && campaignId !== 'new') {
    const campaign = await campaignsRepo.getCampaignDetail(campaignId);
    if (campaign) {
      audienceType = campaign.audienceType;
      audienceFilters = filters || campaign.audienceFilters;
    }
  }

  const count = await campaignsRepo.countAudience(audienceType, audienceFilters);
  return { estimatedAudience: count };
}

async function testSend({ campaignId, testEmail, admin, ipAddress }) {
  const campaign = await getCampaignDetail(campaignId);
  const email = (testEmail || admin.email).trim().toLowerCase();
  const recipient = await query("SELECT id FROM users WHERE LOWER(email) = $1 AND status = 'active'", [email]);
  if (!recipient.rows.length) throw new NotFoundError('No active app account found for this email');
  const result = await broadcastPushNotification({ title: campaign.title, body: campaign.body, userIds: [recipient.rows[0].id], data: { type: 'campaign', campaignId } });
  if (result.error || result.unavailable || result.sent === 0) throw new AppError('Test push was not sent. Check the account device and push configuration.', 503, 'PUSH_UNAVAILABLE');
  await logAudit({ adminId: admin.id, adminEmail: admin.email, action: 'CAMPAIGN_TEST_SENT', targetType: 'campaign', targetId: campaignId, details: { sent: result.sent }, ipAddress });
  return { success: true, sent: result.sent, message: 'Test push accepted by the push service' };
}

async function sendCampaign({ campaignId, admin, ipAddress, scheduled = false }) {
  const campaign = await getCampaignDetail(campaignId);
  if (scheduled && campaign.status !== 'SCHEDULED') return campaign;
  if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) throw new BadRequestError('Campaign cannot be sent in its current state');
  const userIds = await campaignsRepo.getAudienceUserIds(campaign.audienceType, campaign.audienceFilters, campaign.segmentId);
  const claim = await query(
    "UPDATE notification_campaigns SET status = 'SENDING', updated_at = NOW() WHERE id = $1 AND status = $2 RETURNING id",
    [campaignId, campaign.status]
  );
  if (!claim.rows.length) throw new BadRequestError('Campaign is already being processed');
  let result;
  try {
    result = await broadcastPushNotification({
      title: campaign.title, body: campaign.body, userIds,
      data: { type: 'campaign', campaignId, destinationType: campaign.destinationType || 'open_app' },
    });
  } catch {
    result = { sent: 0, failed: 0, error: 'Push delivery failed' };
  }
  const failed = Boolean(result.error || result.unavailable || (result.failed > 0 && result.sent === 0));
  await campaignsRepo.updateCampaign(campaignId, {
    status: failed ? 'FAILED' : 'SENT', sentAt: result.sent > 0 ? new Date() : null,
    audienceCount: userIds.length, sentCount: result.sent || 0,
    deliveredCount: 0, failedCount: result.failed || 0,
  });
  if (failed) throw new AppError('Push delivery failed. The campaign is marked failed; no delivery figures were estimated.', 503, 'PUSH_DELIVERY_FAILED');
  for (const userId of userIds) emitToUser(userId, 'campaign:new', {
    id: campaignId, title: campaign.title, body: campaign.body,
    destinationType: campaign.destinationType, sentAt: new Date(),
  });
  await logAudit({
    adminId: admin.id, adminEmail: admin.email, action: 'CAMPAIGN_SENT',
    targetType: 'campaign', targetId: campaignId,
    details: { audienceCount: userIds.length, acceptedByPushService: result.sent || 0 }, ipAddress,
  });
  return campaignsRepo.getCampaignDetail(campaignId);
}

async function scheduleCampaign({ campaignId, scheduledAt, admin, ipAddress }) {
  const when = new Date(scheduledAt);
  if (!scheduledAt || !Number.isFinite(when.getTime()) || when <= new Date()) throw new BadRequestError('A valid future date and time is required');
  const campaign = await getCampaignDetail(campaignId);
  if (campaign.status !== 'DRAFT') throw new BadRequestError('Only a draft campaign can be scheduled');
  const queue = notificationsQueue();
  const jobId = 'campaign-' + campaignId;
  const oldJob = await queue.getJob(jobId);
  if (oldJob) await oldJob.remove();
  await campaignsRepo.updateCampaign(campaignId, { status: 'SCHEDULED', scheduledAt: when });
  try {
    await queue.add('campaign-send', { campaignId, admin: { id: admin.id, email: admin.email } }, { jobId, delay: Math.max(0, when.getTime() - Date.now()), attempts: 1 });
  } catch {
    await campaignsRepo.updateCampaign(campaignId, { status: 'DRAFT', scheduledAt: null });
    throw new AppError('Campaign could not be scheduled. Please try again.', 503, 'QUEUE_UNAVAILABLE');
  }
  await logAudit({ adminId: admin.id, adminEmail: admin.email, action: 'CAMPAIGN_SCHEDULED', targetType: 'campaign', targetId: campaignId, details: { scheduledAt: when }, ipAddress });
  return campaignsRepo.getCampaignDetail(campaignId);
}

async function cancelCampaign({ campaignId, admin, ipAddress }) {
  const cancelled = await query("UPDATE notification_campaigns SET status = 'CANCELLED', scheduled_at = NULL, updated_at = NOW() WHERE id = $1 AND status IN ('DRAFT', 'SCHEDULED') RETURNING id", [campaignId]);
  if (!cancelled.rows.length) throw new BadRequestError('This campaign cannot be cancelled');
  const job = await notificationsQueue().getJob('campaign-' + campaignId);
  if (job) await job.remove();
  await logAudit({ adminId: admin.id, adminEmail: admin.email, action: 'CAMPAIGN_CANCELLED', targetType: 'campaign', targetId: campaignId, ipAddress });
  return campaignsRepo.getCampaignDetail(campaignId);
}

async function getMetrics(campaignId) {
  const campaign = await campaignsRepo.getCampaignDetail(campaignId);
  if (!campaign) throw new NotFoundError('Campaign not found');

  const openRate = campaign.sentCount > 0
    ? ((campaign.openedCount / campaign.sentCount) * 100).toFixed(1) + '%'
    : '0.0%';

  return {
    audienceCount: campaign.audienceCount,
    sentCount: campaign.sentCount,
    deliveredCount: campaign.deliveredCount,
    openedCount: campaign.openedCount,
    failedCount: campaign.failedCount,
    openRate,
  };
}

module.exports = {
  listCampaigns,
  getCampaignDetail,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  estimateAudience,
  testSend,
  sendCampaign,
  scheduleCampaign,
  cancelCampaign,
  getMetrics,
};

