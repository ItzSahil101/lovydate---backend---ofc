const { performance } = require('node:perf_hooks');
const { pool } = require('../../../infrastructure/database/pool');
const redis = require('../../../infrastructure/redis/client');
const { getIO } = require('../../../infrastructure/websocket/socketServer');
const { listQueues } = require('../jobs/adminJobs.service');

async function measure(check) {
  const start = performance.now();
  try {
    await check();
    return { status: 'healthy', latencyMs: Math.round((performance.now() - start) * 100) / 100 };
  } catch { return { status: 'down', latencyMs: null }; }
}
async function getSystemHealth() {
  const [postgres, redisStatus, queuesResult] = await Promise.all([
    measure(() => pool.query('SELECT 1')),
    measure(async () => { if (await redis.ping() !== 'PONG') throw new Error(); }),
    listQueues().then(queues => ({ queues })).catch(() => ({ queues: null })),
  ]);
  const io = getIO();
  const workers = queuesResult.queues?.reduce((total, queue) => total + queue.activeWorkers, 0);
  const services = {
    api: { status: 'healthy' },
    postgres,
    redis: redisStatus,
    websocket: { status: io ? 'healthy' : 'unavailable', activeConnections: io?.engine?.clientsCount ?? null },
    bullmq: { status: !queuesResult.queues ? 'down' : queuesResult.queues.every(queue => queue.activeWorkers > 0) ? 'healthy' : 'degraded', activeWorkers: workers ?? null },
  };
  return {
    status: Object.values(services).every(service => service.status === 'healthy') ? 'healthy' : 'degraded',
    uptime: Math.floor(process.uptime()), timestamp: new Date().toISOString(), services,
  };
}
async function getSystemMetrics() {
  const memory = process.memoryUsage();
  const started = performance.now();
  await new Promise(resolve => setImmediate(resolve));
  const eventLoopLagMs = Math.round((performance.now() - started) * 100) / 100;
  const [redisStatus, queues] = await Promise.all([
    measure(async () => { if (await redis.ping() !== 'PONG') throw new Error(); }),
    listQueues().catch(() => null),
  ]);
  const queuesSummary = queues ? queues.reduce((total, queue) => {
    for (const key of ['waiting', 'active', 'completed', 'failed']) total[key] += queue[key];
    return total;
  }, { waiting: 0, active: 0, completed: 0, failed: 0 }) : null;
  return {
    apiRequestsPerMin: null, p50LatencyMs: null, p95LatencyMs: null, p99LatencyMs: null,
    errorRatePercentage: null, redisCacheHitRate: null,
    eventLoopLagMs, dbPoolActive: pool.totalCount - pool.idleCount,
    dbPoolIdle: pool.idleCount, dbPoolWaiting: pool.waitingCount,
    redisLatencyMs: redisStatus.latencyMs,
    memoryHeapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    memoryRssMb: Math.round(memory.rss / 1024 / 1024),
    websocketConnections: getIO()?.engine?.clientsCount ?? null, queuesSummary,
  };
}
module.exports = { getSystemHealth, getSystemMetrics };
