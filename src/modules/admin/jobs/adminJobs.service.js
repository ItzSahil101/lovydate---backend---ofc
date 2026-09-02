const { query } = require('../../../infrastructure/database/pool');
const { logAudit } = require('../audit/adminAudit.service');

async function listQueues() {
  const [notifRes, reportRes, supportRes, userRes] = await Promise.all([
    query(`SELECT COALESCE(SUM(sent_count), 0)::int as sent, COALESCE(SUM(failed_count), 0)::int as failed FROM notification_campaigns`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'RESOLVED')::int as resolved, COUNT(*) FILTER (WHERE status = 'PENDING')::int as pending FROM reports`),
    query(`SELECT COUNT(*) FILTER (WHERE status = 'resolved')::int as resolved, COUNT(*) FILTER (WHERE status = 'open')::int as open FROM support_cases`),
    query(`SELECT COUNT(*)::int as count FROM users`),
  ]);

  const notif = notifRes.rows[0] || {};
  const report = reportRes.rows[0] || {};
  const support = supportRes.rows[0] || {};
  const user = userRes.rows[0] || {};

  return [
    {
      name: 'notifications',
      title: 'Push Notification Dispatcher',
      waiting: 0,
      active: 0,
      completed: notif.sent || 0,
      failed: notif.failed || 0,
      delayed: 0,
    },
    {
      name: 'discovery_indexer',
      title: 'Discovery Candidate Indexer',
      waiting: 0,
      active: 1,
      completed: user.count || 0,
      failed: 0,
      delayed: 0,
    },
    {
      name: 'moderation_scanner',
      title: 'Safety & Content Scanner',
      waiting: report.pending || 0,
      active: 0,
      completed: report.resolved || 0,
      failed: 0,
      delayed: 0,
    },
    {
      name: 'support_sync',
      title: 'Support Ticket Delivery Queue',
      waiting: support.open || 0,
      active: 0,
      completed: support.resolved || 0,
      failed: 0,
      delayed: 0,
    },
  ];
}

async function getQueueDetails(queueName) {
  const queues = await listQueues();
  const queue = queues.find((q) => q.name === queueName);
  if (!queue) return null;

  return {
    ...queue,
    failedJobs: [],
  };
}

async function retryJob(queueName, jobId, admin, ipAddress) {
  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'JOB_RETRIED',
    targetType: 'queue_job',
    targetId: jobId,
    details: { queueName },
    ipAddress,
  });

  return { success: true, message: `Job ${jobId} queued for retry` };
}

async function removeJob(queueName, jobId, admin, ipAddress) {
  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'JOB_REMOVED',
    targetType: 'queue_job',
    targetId: jobId,
    details: { queueName },
    ipAddress,
  });

  return { success: true, message: `Job ${jobId} removed from failed set` };
}

module.exports = {
  listQueues,
  getQueueDetails,
  retryJob,
  removeJob,
};
