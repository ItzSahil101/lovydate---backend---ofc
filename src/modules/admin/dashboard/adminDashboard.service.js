const redis = require('../../../infrastructure/redis/client');
const dashboardRepo = require('./adminDashboard.repository');

const CACHE_TTL_SECONDS = 30; // 30s cache for heavy queries

async function getSummary(range = '7D') {
  const cacheKey = `admin:dashboard:summary:${range}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const [raw, latestCampaign] = await Promise.all([
    dashboardRepo.getAggregatedSummary(range),
    dashboardRepo.getLatestCampaign(),
  ]);

  // Generate sparklines and percentages
  const summary = {
    metrics: {
      totalUsers: {
        value: raw.totalUsers,
        sparkline: [raw.totalUsers],
      },
      activeToday: {
        value: raw.activeToday,
        sparkline: [raw.activeToday],
      },
      onlineNow: {
        value: 0,
        sparkline: [0],
      },
      newUsers: {
        value: raw.newUsersToday,
        sparkline: [raw.newUsersToday],
      },
      openReports: {
        value: raw.openReports,
        sparkline: [raw.openReports],
        priorityHigh: raw.highPriorityReports,
      },
      pendingModeration: {
        value: raw.pendingPhotos + raw.pendingAppeals,
        sparkline: [raw.pendingPhotos + raw.pendingAppeals],
      },
    },
    secondary: {
      likesToday: { value: raw.likesToday },
      matchesToday: { value: raw.matchesToday },
      messagesToday: { value: raw.messagesToday },
      postsToday: { value: raw.postsToday },
      suspensionsToday: { value: raw.suspensionsToday },
    },
    moderationQueue: {
      highPriorityReports: raw.highPriorityReports,
      openReports: raw.openReports,
      profilesAwaitingReview: raw.pendingPhotos,
      contentFlags: raw.openReports,
      appeals: raw.pendingAppeals,
    },
    latestCampaign,
  };

  try {
    await redis.set(cacheKey, JSON.stringify(summary), 'EX', CACHE_TTL_SECONDS);
  } catch {}

  return summary;
}

async function getLiveActivity() {
  const cacheKey = 'admin:dashboard:live';
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const liveCounts = await dashboardRepo.getLiveActivity();
  const live = {
    onlineNow: Number(liveCounts.onlineNow || 0),
    // Discovery-screen presence is not tracked separately yet.
    discovering: 0,
    messagesPerMin: Number(liveCounts.messagesPerMin || 0),
    likesPerMin: Number(liveCounts.likesPerMin || 0),
    matchesPerMin: Number(liveCounts.matchesPerMin || 0),
    feedViewsPerMin: 0,
    timestamp: new Date().toISOString(),
  };

  try {
    await redis.set(cacheKey, JSON.stringify(live), 'EX', 10); // 10s cache
  } catch {}

  return live;
}

async function getChart(period = '7D') {
  const cacheKey = `admin:dashboard:chart:${period}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch {}

  const rows = await dashboardRepo.getChartSeries(period);
  
  const series = rows.map((r) => ({
      date: new Date(r.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      activeUsers: Number(r.activeUsers) || 0,
      likes: Number(r.likes) || 0,
      matches: Number(r.matches) || 0,
      messages: Number(r.messages) || 0,
    }));

  try {
    await redis.set(cacheKey, JSON.stringify(series), 'EX', 60);
  } catch {}

  return series;
}

async function getActivity(limit = 10) {
  return dashboardRepo.getRecentOperationalActivity(limit);
}

module.exports = {
  getSummary,
  getLiveActivity,
  getChart,
  getActivity,
};
