const { Worker } = require('bullmq');
const redis = require('../redis/client');
const { QUEUE_NAMES } = require('../../config/constants');

function initWorkers(services = {}) {
  const refillWorker = new Worker(
    QUEUE_NAMES.DISCOVERY_REFILL,
    async (job) => {
      const { userId } = job.data;
      if (services.discoveryService) {
        await services.discoveryService.generateCandidatePool(userId);
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  const warmupWorker = new Worker(
    QUEUE_NAMES.LOGIN_WARMUP,
    async (job) => {
      const { userId } = job.data;
      if (services.profileService) {
        await services.profileService.getPublicProfile(userId);
      }
      if (services.discoveryService) {
        await services.discoveryService.getCandidatesFromPoolOrGenerate(userId, 100);
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  const notificationsWorker = new Worker(
    QUEUE_NAMES.NOTIFICATIONS,
    async (job) => {
      const { userId, type, payload } = job.data;
      console.log(`[NOTIFICATION JOB] type=${type} targetUser=${userId} payload=${JSON.stringify(payload)}`);
    },
    {
      connection: redis,
      concurrency: 10,
    }
  );

  return {
    refillWorker,
    warmupWorker,
    notificationsWorker,
  };
}

module.exports = { initWorkers };
