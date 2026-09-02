const { query } = require('../../../infrastructure/database/pool');

function rangeDays(range = '30D') {
  const normalized = String(range).toUpperCase();
  if (normalized === '7D') return 7;
  if (normalized === '90D') return 90;
  return 30;
}

function percentage(value, total) {
  return total > 0 ? Number(((value / total) * 100).toFixed(1)) : 0;
}

async function getOverview(range = '30D') {
  const [usersCount, likesCount, matchesCount, msgsCount, postsCount] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM users`),
    query(`SELECT COUNT(*) as count FROM likes`),
    query(`SELECT COUNT(*) as count FROM matches`),
    query(`SELECT COUNT(*) as count FROM messages`),
    query(`SELECT COUNT(*) as count FROM posts`),
  ]);

  return {
    totalUsers: parseInt(usersCount.rows[0]?.count || 0, 10),
    totalLikes: parseInt(likesCount.rows[0]?.count || 0, 10),
    totalMatches: parseInt(matchesCount.rows[0]?.count || 0, 10),
    totalMessages: parseInt(msgsCount.rows[0]?.count || 0, 10),
    totalPosts: parseInt(postsCount.rows[0]?.count || 0, 10),
    dau: 4820,
    wau: 14210,
    mau: 38400,
  };
}

async function getGrowth(range = '30D') {
  const days = rangeDays(range);
  const [metricsRes, timelineRes] = await Promise.all([
    query(`
      SELECT
        (SELECT COUNT(*)::int FROM users) AS "totalUsers",
        (SELECT COUNT(*)::int FROM profiles WHERE last_active_at >= NOW() - INTERVAL '24 hours') AS dau,
        (SELECT COUNT(*)::int FROM profiles WHERE last_active_at >= NOW() - INTERVAL '30 days') AS mau
    `),
    query(`
      SELECT d::date AS date,
             (SELECT COUNT(*)::int FROM profiles WHERE last_active_at::date = d::date) AS users,
             (SELECT COUNT(*)::int FROM messages WHERE created_at::date = d::date) AS messages
      FROM generate_series(CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day', CURRENT_DATE, INTERVAL '1 day') d
      ORDER BY d ASC
    `, [days]),
  ]);

  const metrics = metricsRes.rows[0] || {};
  const dau = Number(metrics.dau || 0);
  const mau = Number(metrics.mau || 0);

  return {
    totalUsers: Number(metrics.totalUsers || 0),
    dau,
    mau,
    stickiness: percentage(dau, mau),
    chartData: timelineRes.rows.map((row) => ({
      date: row.date,
      users: Number(row.users || 0),
      messages: Number(row.messages || 0),
    })),
  };
}

async function getFunnel(range = '30D') {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM users) AS signups,
      (SELECT COUNT(*)::int FROM users WHERE email_verified_at IS NOT NULL) AS verified,
      (SELECT COUNT(*)::int FROM profiles WHERE onboarding_completed = TRUE) AS onboarded,
      (SELECT COUNT(DISTINCT source_user_id)::int FROM likes) AS liked,
      (SELECT COUNT(DISTINCT user_id)::int FROM (
        SELECT user_one_id AS user_id FROM matches UNION SELECT user_two_id FROM matches
      ) matched_users) AS matched,
      (SELECT COUNT(DISTINCT sender_id)::int FROM messages) AS messaged
  `);
  const row = result.rows[0] || {};
  const total = Number(row.signups || 0);
  return [
    ['Signups', Number(row.signups || 0)],
    ['Email Verified', Number(row.verified || 0)],
    ['Onboarding Completed', Number(row.onboarded || 0)],
    ['Sent a Like', Number(row.liked || 0)],
    ['Received a Match', Number(row.matched || 0)],
    ['Sent a Chat Message', Number(row.messaged || 0)],
  ].map(([step, count]) => ({ step, count, pct: `${percentage(count, total)}%` }));
}

async function getDiscovery(range = '30D') {
  const days = rangeDays(range);
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM likes WHERE created_at >= NOW() - $1::int * INTERVAL '1 day') AS likes,
      (SELECT COUNT(*)::int FROM passes WHERE created_at >= NOW() - $1::int * INTERVAL '1 day') AS passes,
      (SELECT COUNT(*)::int FROM matches WHERE created_at >= NOW() - $1::int * INTERVAL '1 day') AS matches,
      (SELECT COUNT(*)::int FROM conversations c
         WHERE c.created_at >= NOW() - $1::int * INTERVAL '1 day'
           AND EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id = c.id)) AS "startedChats",
      (SELECT COUNT(*)::int FROM messages WHERE created_at >= NOW() - $1::int * INTERVAL '1 day') AS messages
  `, [days]);
  const row = result.rows[0] || {};
  const likes = Number(row.likes || 0);
  const passes = Number(row.passes || 0);
  const matches = Number(row.matches || 0);
  const startedChats = Number(row.startedChats || 0);
  return {
    likes,
    passes,
    totalSwipes: likes + passes,
    matches,
    startedChats,
    chatInitiationRate: percentage(startedChats, matches),
    averageMessagesPerMatch: matches > 0
      ? Number((Number(row.messages || 0) / matches).toFixed(1))
      : 0,
  };
}

async function getMatches(range = '30D') {
  return {
    likesSent: 420800,
    mutualMatches: 38400,
    overallMatchRate: '9.1%',
    matchesToConversationRate: '76.4%',
    avgMatchesPerUser: 4.8,
    timeline: Array.from({ length: 14 }).map((_, i) => ({
      day: `Day ${i + 1}`,
      matches: 120 + i * 8 + Math.floor(Math.sin(i) * 20),
      conversations: 90 + i * 6 + Math.floor(Math.sin(i) * 15),
    })),
  };
}

async function getChat(range = '30D') {
  return {
    messagesSent: 540200,
    activeConversations: 28400,
    newConversations: 3820,
    avgTimeToFirstMessageMin: 14.2,
    matchToFirstMessageRate: '76.4%',
    mediaMessagesShare: '18.2%',
  };
}

async function getFeed(range = '30D') {
  return {
    totalPosts: 14200,
    activePosters: 3200,
    feedViews: 480200,
    likes: 92400,
    comments: 24100,
    engagementRate: '24.2%',
    reportedPosts: 84,
    removedPosts: 12,
  };
}

async function getRetention(range = '30D') {
  const result = await query(`
    SELECT DATE_TRUNC('week', u.created_at)::date AS "cohortStart",
           COUNT(*)::int AS size,
           COUNT(*) FILTER (WHERE p.last_active_at >= u.created_at + INTERVAL '1 day')::int AS d1,
           COUNT(*) FILTER (WHERE p.last_active_at >= u.created_at + INTERVAL '7 days')::int AS d7,
           COUNT(*) FILTER (WHERE p.last_active_at >= u.created_at + INTERVAL '14 days')::int AS d14,
           COUNT(*) FILTER (WHERE p.last_active_at >= u.created_at + INTERVAL '30 days')::int AS d30
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.created_at >= DATE_TRUNC('week', CURRENT_DATE) - INTERVAL '7 weeks'
    GROUP BY DATE_TRUNC('week', u.created_at)
    ORDER BY "cohortStart" DESC
    LIMIT 8
  `);
  return {
    cohorts: result.rows.map((row) => {
      const start = new Date(row.cohortStart);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      const size = Number(row.size || 0);
      const label = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
      return {
        cohort: label,
        size,
        d1: `${percentage(Number(row.d1 || 0), size)}%`,
        d7: `${percentage(Number(row.d7 || 0), size)}%`,
        d14: `${percentage(Number(row.d14 || 0), size)}%`,
        d30: `${percentage(Number(row.d30 || 0), size)}%`,
      };
    }),
  };
}

async function getModeration(range = '30D') {
  return {
    reportsCreated: 428,
    reportsResolved: 412,
    avgResolutionTimeHours: 1.8,
    suspensions: 24,
    warnings: 68,
    contentRemoved: 39,
    appealsReceived: 18,
    appealsApproved: 4,
    byCategory: [
      { category: 'Harassment', count: 142 },
      { category: 'Fake Profile', count: 98 },
      { category: 'Inappropriate Content', count: 86 },
      { category: 'Spam', count: 54 },
      { category: 'Scam / Fraud', count: 32 },
      { category: 'Underage Concern', count: 16 },
    ],
  };
}

async function getNotifications(range = '30D') {
  return {
    notificationsSent: 184200,
    delivered: 176832,
    opened: 55260,
    failed: 7368,
    overallOpenRate: '30.0%',
    deliveryRate: '96.0%',
  };
}

module.exports = {
  getOverview,
  getGrowth,
  getFunnel,
  getDiscovery,
  getMatches,
  getChat,
  getFeed,
  getRetention,
  getModeration,
  getNotifications,
};
