const { logAudit } = require('../audit/adminAudit.service');

const QUEUES = [
  { name: 'notifications', title: 'Push Notifications', waiting: 0, active: 1, completed: 42100, failed: 2, delayed: 0 },
  { name: 'discovery_generation', title: 'Discovery Candidate Indexer', waiting: 2, active: 1, completed: 89400, failed: 0, delayed: 0 },
  { name: 'moderation', title: 'Automated Image & Text Scanner', waiting: 0, active: 0, completed: 15400, failed: 1, delayed: 0 },
  { name: 'cleanup', title: 'Session & Token Garbage Collector', waiting: 0, active: 0, completed: 2400, failed: 0, delayed: 0 },
  { name: 'analytics_aggregation', title: 'Daily Analytics Rollup', waiting: 1, active: 0, completed: 365, failed: 0, delayed: 0 },
];

async function listQueues() {
  return QUEUES;
}

async function getQueueDetails(queueName) {
  const queue = QUEUES.find(q => q.name === queueName);
  if (!queue) return null;

  return {
    ...queue,
    failedJobs: queue.failed > 0 ? [
      {
        id: `job-${queueName}-8492`,
        name: `${queueName}_task`,
        failedReason: 'FCM push timeout response 504 Gateway',
        attemptsMade: 3,
        timestamp: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      }
    ] : [],
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
