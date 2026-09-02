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
  let days = 7;
  if (period === '24H') days = 1;
  else if (period === '30D') days = 30;

  // Aggregate daily history from analytics_daily or time-bucketing
  const res = await query(`
    SELECT d::date AS date,
           COALESCE(ad.active_users, 0) AS "activeUsers",
           COALESCE(ad.likes, 0) AS likes,
           COALESCE(ad.matches, 0) AS matches,
           COALESCE(ad.messages, 0) AS messages,
           COALESCE(ad.new_users, 0) AS "newUsers"
    FROM generate_series(
      CURRENT_DATE - INTERVAL '${days - 1} days',
      CURRENT_DATE,
      '1 day'::interval
    ) d
    LEFT JOIN analytics_daily ad ON ad.date = d::date
    ORDER BY d ASC
  `);

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

module.exports = {
  getAggregatedSummary,
  getChartSeries,
  getRecentOperationalActivity,
};
