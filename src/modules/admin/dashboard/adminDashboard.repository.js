const { query } = require('../../../infrastructure/database/pool');

async function getAggregatedSummary(range = '7D') {
  // Pull fast metrics with safety fallbacks
  const usersCountRes = await query(`SELECT COUNT(*) as count FROM users`);
  const activeTodayRes = await query(`
    SELECT COUNT(DISTINCT user_id) as count
    FROM profiles
    WHERE last_active_at >= NOW() - INTERVAL '24 hours'
  `);
  const newUsersRes = await query(`
    SELECT COUNT(*) as count
    FROM users
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const openReportsRes = await query(`
    SELECT COUNT(*) as count
    FROM reports
    WHERE status IN ('open', 'in_review')
  `);
  const highPriorityReportsRes = await query(`
    SELECT COUNT(*) as count
    FROM reports
    WHERE status IN ('open', 'in_review') AND priority IN ('critical', 'high')
  `);
  const pendingPhotosRes = await query(`
    SELECT COUNT(*) as count
    FROM profile_photos
    WHERE moderation_status = 'pending_review'
  `);
  const pendingAppealsRes = await query(`
    SELECT COUNT(*) as count
    FROM moderation_appeals
    WHERE status = 'pending'
  `);
  const likesTodayRes = await query(`
    SELECT COUNT(*) as count
    FROM likes
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const matchesTodayRes = await query(`
    SELECT COUNT(*) as count
    FROM matches
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const messagesTodayRes = await query(`
    SELECT COUNT(*) as count
    FROM messages
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const postsTodayRes = await query(`
    SELECT COUNT(*) as count
    FROM posts
    WHERE created_at >= NOW() - INTERVAL '24 hours'
  `);
  const suspensionsTodayRes = await query(`
    SELECT COUNT(*) as count
    FROM user_restrictions
    WHERE restriction_type = 'ACCOUNT_SUSPENSION' AND created_at >= NOW() - INTERVAL '24 hours'
  `);

  return {
    totalUsers: parseInt(usersCountRes.rows[0]?.count || 0, 10),
    activeToday: parseInt(activeTodayRes.rows[0]?.count || 0, 10),
    newUsersToday: parseInt(newUsersRes.rows[0]?.count || 0, 10),
    openReports: parseInt(openReportsRes.rows[0]?.count || 0, 10),
    highPriorityReports: parseInt(highPriorityReportsRes.rows[0]?.count || 0, 10),
    pendingPhotos: parseInt(pendingPhotosRes.rows[0]?.count || 0, 10),
    pendingAppeals: parseInt(pendingAppealsRes.rows[0]?.count || 0, 10),
    likesToday: parseInt(likesTodayRes.rows[0]?.count || 0, 10),
    matchesToday: parseInt(matchesTodayRes.rows[0]?.count || 0, 10),
    messagesToday: parseInt(messagesTodayRes.rows[0]?.count || 0, 10),
    postsToday: parseInt(postsTodayRes.rows[0]?.count || 0, 10),
    suspensionsToday: parseInt(suspensionsTodayRes.rows[0]?.count || 0, 10),
  };
}

async function getChartSeries(period = '7D') {
  const days = period === '24H' ? 1 : period === '30D' ? 30 : 7;

  const res = await query(`
    WITH dates AS (
      SELECT generate_series(
        CURRENT_DATE - ($1::int - 1),
        CURRENT_DATE,
        '1 day'::interval
      )::date AS date
    ),
    daily_activity AS (
      SELECT activity_date AS date, COUNT(*)::int AS "activeUsers"
      FROM user_daily_activity
      WHERE activity_date >= CURRENT_DATE - ($1::int - 1)
      GROUP BY activity_date
    ),
    daily_likes AS (
      SELECT created_at::date AS date, COUNT(*)::int AS likes
      FROM likes
      WHERE created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY created_at::date
    ),
    daily_matches AS (
      SELECT created_at::date AS date, COUNT(*)::int AS matches
      FROM matches
      WHERE created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY created_at::date
    ),
    daily_messages AS (
      SELECT created_at::date AS date, COUNT(*)::int AS messages
      FROM messages
      WHERE created_at >= CURRENT_DATE - ($1::int - 1)
      GROUP BY created_at::date
    )
    SELECT d.date,
           COALESCE(a."activeUsers", 0)::int AS "activeUsers",
           COALESCE(l.likes, 0)::int AS likes,
           COALESCE(m.matches, 0)::int AS matches,
           COALESCE(msg.messages, 0)::int AS messages
    FROM dates d
    LEFT JOIN daily_activity a ON a.date = d.date
    LEFT JOIN daily_likes l ON l.date = d.date
    LEFT JOIN daily_matches m ON m.date = d.date
    LEFT JOIN daily_messages msg ON msg.date = d.date
    ORDER BY d.date ASC
  `, [days]);

  return res.rows;
}

async function getRecentOperationalActivity(limit = 10) {
  const res = await query(
    `SELECT id, admin_email AS "adminEmail", action, target_type AS "targetType",
            target_id AS "targetId", reason, details, created_at AS "createdAt"
     FROM admin_audit_logs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return res.rows;
}

async function getLiveActivity() {
  const result = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM profiles WHERE last_active_at >= NOW() - INTERVAL '3 minutes') AS "onlineNow",
      (SELECT COUNT(*)::int FROM messages WHERE created_at >= NOW() - INTERVAL '1 minute') AS "messagesPerMin",
      (SELECT COUNT(*)::int FROM likes WHERE created_at >= NOW() - INTERVAL '1 minute') AS "likesPerMin",
      (SELECT COUNT(*)::int FROM matches WHERE created_at >= NOW() - INTERVAL '1 minute') AS "matchesPerMin"
  `);
  return result.rows[0] || {};
}

async function getLatestCampaign() {
  const result = await query(`
    SELECT name, status, sent_count::int AS sent,
           delivered_count::int AS delivered, opened_count::int AS opened,
           CASE WHEN sent_count > 0
             THEN ROUND((opened_count::numeric / sent_count::numeric) * 100, 1)::text || '%'
             ELSE '0.0%'
           END AS "openRate"
    FROM notification_campaigns
    ORDER BY COALESCE(sent_at, scheduled_at, created_at) DESC
    LIMIT 1
  `);
  return result.rows[0] || null;
}

module.exports = {
  getAggregatedSummary,
  getChartSeries,
  getRecentOperationalActivity,
  getLiveActivity,
  getLatestCampaign,
};
