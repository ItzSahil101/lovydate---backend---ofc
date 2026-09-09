const { getQueue } = require('../../../infrastructure/queue/queueManager');
const { QUEUE_NAMES } = require('../../../config/constants');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');

const queueNames = Object.values(QUEUE_NAMES);
function resolveQueue(name) {
  if (!queueNames.includes(name)) throw new NotFoundError('Queue not found');
  return getQueue(name);
}
async function queueSnapshot(name) {
  const queue = resolveQueue(name);
  const [counts, workers] = await Promise.all([
    queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed'),
    queue.getWorkers(),
  ]);
  return { name, waiting: counts.wait ?? 0, active: counts.active ?? 0, completed: counts.completed ?? 0, failed: counts.failed ?? 0, delayed: counts.delayed ?? 0, activeWorkers: workers.length };
}
async function listQueues() {
  return Promise.all(queueNames.map(queueSnapshot));
}
async function getQueueDetails(queueName) {
  const queue = resolveQueue(queueName);
  const [snapshot, failedJobs] = await Promise.all([queueSnapshot(queueName), queue.getFailed(0, 49)]);
  return { ...snapshot, failedJobs: failedJobs.map(job => ({ id: job.id, name: job.name, failedReason: job.failedReason, attemptsMade: job.attemptsMade, timestamp: job.timestamp })) };
}
async function performJobAction(action, queueName, jobId, admin, ipAddress) {
  const queue = resolveQueue(queueName);
  const job = await queue.getJob(jobId);
  if (!job) throw new NotFoundError('Job not found');
  const state = await job.getState();
  if (state !== 'failed') throw new BadRequestError('Only failed jobs can be retried or removed');
  if (action === 'retry') await job.retry();
  else await job.remove();
  await logAudit({
    adminId: admin.id, adminEmail: admin.email, action: action === 'retry' ? 'JOB_RETRIED' : 'JOB_REMOVED',
    targetType: 'queue_job', targetId: jobId, details: { queueName }, ipAddress,
  });
  return { success: true, message: action === 'retry' ? 'Job queued for retry' : 'Failed job removed' };
}
const retryJob = (...args) => performJobAction('retry', ...args);
const removeJob = (...args) => performJobAction('remove', ...args);
module.exports = { listQueues, getQueueDetails, retryJob, removeJob };
