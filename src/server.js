require('dotenv').config();
const http = require('http');
const env = require('./config/env');
const app = require('./app');
const redis = require('./infrastructure/redis/client');
const { pool } = require('./infrastructure/database/pool');
const { initSocketServer } = require('./infrastructure/websocket/socketServer');
const { initWorkers } = require('./infrastructure/queue/workers');

const discoveryService = require('./modules/discovery/discovery.service');
const profileService = require('./modules/profiles/profile.service');

const { runMigrations } = require('./infrastructure/database/migrate');

const server = http.createServer(app);

initSocketServer(server);

const workers = initWorkers({
  discoveryService,
  profileService,
});

async function startServer() {
  try {
    await runMigrations();
  } catch (e) {
    console.error('Migration initialization warning:', e.message);
  }

  server.listen(env.port, () => {
    console.log(`LovyDate Production Backend listening on port ${env.port} (${env.nodeEnv})`);
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
