const { query } = require('../../../infrastructure/database/pool');

async function globalSearch(q, limit = 5) {
  if (!q || !q.trim() || q.trim().length < 2) {
    return { users: [], reports: [], posts: [], campaigns: [], cases: [] };
  }

  const term = `%${q.trim().toLowerCase()}%`;
  const rawId = q.trim();

  const [usersRes, reportsRes, postsRes, campaignsRes, casesRes] = await Promise.all([
    query(
      `SELECT u.id, u.email, u.status, p.display_name AS "displayName",
              (SELECT url FROM profile_photos WHERE user_id = u.id AND is_primary = true LIMIT 1) AS "photo"
       FROM users u
       LEFT JOIN profiles p ON u.id = p.user_id
       WHERE LOWER(u.email) LIKE $1 OR LOWER(p.display_name) LIKE $1 OR u.id::text = $2
       LIMIT $3`,
      [term, rawId, limit]
    ),
    query(
      `SELECT r.id, r.priority, r.category, r.status, r.reason, r.reported_user_id AS "reportedUserId",
              p.display_name AS "reportedUserName"
       FROM reports r
       LEFT JOIN profiles p ON r.reported_user_id = p.user_id
       WHERE LOWER(r.reason) LIKE $1 OR LOWER(r.category) LIKE $1 OR r.id::text = $2
       LIMIT $3`,
      [term, rawId, limit]
    ),
    query(
      `SELECT p.id, p.content, p.created_at AS "createdAt", prof.display_name AS "authorName"
       FROM posts p
       LEFT JOIN profiles prof ON p.user_id = prof.user_id
       WHERE LOWER(p.content) LIKE $1 OR p.id::text = $2
       LIMIT $3`,
      [term, rawId, limit]
    ),
    query(
      `SELECT id, name, title, status, scheduled_at AS "scheduledAt"
       FROM notification_campaigns
       WHERE LOWER(name) LIKE $1 OR LOWER(title) LIKE $1 OR id::text = $2
       LIMIT $3`,
      [term, rawId, limit]
    ),
    query(
      `SELECT sc.id, sc.subject, sc.status, sc.category, p.display_name AS "userName"
       FROM support_cases sc
       LEFT JOIN profiles p ON sc.user_id = p.user_id
       WHERE LOWER(sc.subject) LIKE $1 OR LOWER(sc.category) LIKE $1 OR sc.id::text = $2
       LIMIT $3`,
      [term, rawId, limit]
    ),
  ]);

  return {
    users: usersRes.rows,
    reports: reportsRes.rows,
    posts: postsRes.rows,
    campaigns: campaignsRes.rows,
    cases: casesRes.rows,
  };
}

module.exports = {
  globalSearch,
};
