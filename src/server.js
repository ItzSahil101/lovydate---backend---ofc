require('dotenv').config();
const http = require('http');
const env = require('./config/env');
const app = require('./app');
const redis = require('./infrastructure/redis/client');
const { pool } = require('./infrastructure/database/pool');
const { initSocketServer, closeSocketRedis } = require('./infrastructure/websocket/socketServer');
const { initWorkers } = require('./infrastructure/queue/workers');

const discoveryService = require('./modules/discovery/discovery.service');
const profileService = require('./modules/profiles/profile.service');

const { runMigrations } = require('./infrastructure/database/migrate');
const { preloadAdminCache } = require('./modules/admin/adminCacheWarmup');

const server = http.createServer(app);

let workers = {};

async function startServer() {
  try {
    await initSocketServer(server);
    await runMigrations();
    // Do not consume jobs until this replica has the complete schema.
    workers = initWorkers({
      discoveryService,
      profileService,
    });
  } catch (e) {
    console.error('Server startup aborted because migrations failed:', e.message);
    process.exitCode = 1;
    return;
  }

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`LovyDate Production Backend listening on port ${env.port} (${env.nodeEnv})`);
    // Warm expensive admin reads after the instance is accepting health
    // checks. Failures are non-fatal because requests can still load directly.
    preloadAdminCache().catch((err) => {
      console.warn('Admin cache preload failed:', err.message);
    });
  });
}

startServer();

async function gracefulShutdown(signal) {
  console.log(`Received ${signal}. Shutting down gracefully...`);

  server.close(() => {
    console.log('HTTP and WebSocket server closed.');
  });

  try {
    if (workers.refillWorker) await workers.refillWorker.close();
    if (workers.warmupWorker) await workers.warmupWorker.close();
    if (workers.notificationsWorker) await workers.notificationsWorker.close();
  } catch (err) {
    console.error('Error closing queue workers:', err);
  }

  try {
    await closeSocketRedis();
    console.log('Socket.IO Redis adapter connections closed.');
  } catch (err) {
    console.error('Error closing Socket.IO Redis connections:', err);
  }

  try {
    await redis.quit();
    console.log('Redis connection closed.');
  } catch (err) {
    console.error('Error closing Redis:', err);
  }

  try {
    await pool.end();
    console.log('PostgreSQL connection pool closed.');
  } catch (err) {
    console.error('Error closing PostgreSQL pool:', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = server;
