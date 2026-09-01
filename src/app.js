const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const env = require('./config/env');
const { pool } = require('./infrastructure/database/pool');
const redis = require('./infrastructure/redis/client');
const { errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./modules/auth/auth.routes');
const onboardingRoutes = require('./modules/onboarding/onboarding.routes');
const interestsRoutes = require('./modules/interests/interests.routes');
const profileRoutes = require('./modules/profiles/profile.routes');
const discoveryRoutes = require('./modules/discovery/discovery.routes');
const likesRoutes = require('./modules/likes/likes.routes');
const matchesRoutes = require('./modules/matches/matches.routes');
const chatRoutes = require('./modules/chat/chat.routes');
const blocksRoutes = require('./modules/blocks/blocks.routes');
const reportsRoutes = require('./modules/reports/reports.routes');
const bootstrapRoutes = require('./modules/bootstrap/bootstrap.routes');
const mediaRoutes = require('./modules/media/media.routes');
const feedRoutes = require('./modules/feed/feed.routes');
const notificationsRoutes = require('./modules/notifications/notifications.routes');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: env.cors.origin }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

app.get('/health/live', (req, res) => {
  res.status(200).json({ status: 'live', uptime: process.uptime() });
});

app.get('/health/ready', async (req, res) => {
  let dbOk = false;
  let redisOk = false;

  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    dbOk = true;
  } catch {}

  try {
    const ping = await redis.ping();
    redisOk = ping === 'PONG';
  } catch {}

  const isReady = dbOk && redisOk;
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'degraded',
    database: dbOk ? 'up' : 'down',
    redis: redisOk ? 'up' : 'down',
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/interests', interestsRoutes);
app.use('/api/v1/profiles', profileRoutes);
app.use('/api/v1/discovery', discoveryRoutes);
app.use('/api/v1/users', likesRoutes);
app.use('/api/v1/users', blocksRoutes);
app.use('/api/v1/users', reportsRoutes);
app.use('/api/v1/matches', matchesRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/conversations', chatRoutes);
app.use('/api/v1/bootstrap', bootstrapRoutes);
app.use('/api/v1/media', mediaRoutes);
app.use('/api/v1/feed', feedRoutes);
app.use('/api/v1/notifications', notificationsRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    },
  });
});

app.use(errorHandler);

module.exports = app;
