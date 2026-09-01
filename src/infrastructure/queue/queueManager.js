const { Queue } = require('bullmq');
const redis = require('../redis/client');
const { QUEUE_NAMES } = require('../../config/constants');

const queues = {};

function getQueue(name) {
  if (!queues[name]) {
    queues[name] = new Queue(name, {
      connection: redis,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });
  }
  return queues[name];
}

async function addJob(queueName, jobName, data, options = {}) {
  try {
    const queue = getQueue(queueName);
    return await queue.add(jobName, data, options);
  } catch (err) {
    console.error(`Failed to add job to queue ${queueName}:`, err.message);
    return null;
  }
}

module.exports = {
  getQueue,
  addJob,
  discoveryRefillQueue: () => getQueue(QUEUE_NAMES.DISCOVERY_REFILL),
  loginWarmupQueue: () => getQueue(QUEUE_NAMES.LOGIN_WARMUP),
  notificationsQueue: () => getQueue(QUEUE_NAMES.NOTIFICATIONS),
};
