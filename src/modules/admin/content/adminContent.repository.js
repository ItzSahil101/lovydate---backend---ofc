const { query } = require('../../../infrastructure/database/pool');

async function listFeedContent({ status = 'all', limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`p.moderation_status = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`p.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT p.id, p.user_id AS "userId", p.content, p.location_name AS "locationName",
           p.moderation_status AS "moderationStatus", p.is_comments_disabled AS "isCommentsDisabled",
           p.created_at AS "createdAt",
           prof.display_name AS "authorName", u.email AS "authorEmail",
           COALESCE(array_agg(DISTINCT ph.url) FILTER (WHERE ph.url IS NOT NULL), '{}') AS photos,
           COALESCE(lk.likes_count, 0)::int AS "likesCount",
           COALESCE(cm.comments_count, 0)::int AS "commentsCount",
           COALESCE(rep.reports_count, 0)::int AS "reportsCount"
    FROM posts p
    JOIN users u ON p.user_id = u.id
    LEFT JOIN profiles prof ON p.user_id = prof.user_id
    LEFT JOIN post_photos ph ON p.id = ph.post_id
    LEFT JOIN (SELECT post_id, COUNT(*) AS likes_count FROM post_likes GROUP BY post_id) lk ON p.id = lk.post_id
    LEFT JOIN (SELECT post_id, COUNT(*) AS comments_count FROM post_comments GROUP BY post_id) cm ON p.id = cm.post_id
    LEFT JOIN (SELECT target_id, COUNT(*) AS reports_count FROM reports WHERE target_type = 'post' GROUP BY target_id) rep ON p.id::text = rep.target_id
    ${whereClause}
    GROUP BY p.id, p.user_id, p.content, p.location_name, p.moderation_status, p.is_comments_disabled, p.created_at, prof.display_name, u.email, lk.likes_count, cm.comments_count, rep.reports_count
    ORDER BY p.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function listPhotos({ status = 'all', limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`ph.moderation_status = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`ph.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT ph.id, ph.user_id AS "userId", ph.url, ph.is_primary AS "isPrimary",
           ph.moderation_status AS "moderationStatus", ph.created_at AS "createdAt",
           p.display_name AS "userName", u.email AS "userEmail",
           COALESCE(rep.reports_count, 0)::int AS "reportsCount"
    FROM profile_photos ph
    JOIN users u ON ph.user_id = u.id
    LEFT JOIN profiles p ON ph.user_id = p.user_id
    LEFT JOIN (SELECT target_id, COUNT(*) AS reports_count FROM reports WHERE target_type = 'profile_photo' GROUP BY target_id) rep ON ph.id::text = rep.target_id
    ${whereClause}
    ORDER BY ph.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function listComments({ status = 'all', limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status && status !== 'all') {
    params.push(status);
    conditions.push(`c.moderation_status = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`c.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT c.id, c.post_id AS "postId", c.user_id AS "userId", c.comment_text AS "commentText",
           c.moderation_status AS "moderationStatus", c.created_at AS "createdAt",
           p.display_name AS "authorName", u.email AS "authorEmail"
    FROM post_comments c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN profiles p ON c.user_id = p.user_id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function listProfilesPendingReview({ limit = 25, cursor }) {
  const params = [];
  let where = 'WHERE p.onboarding_completed = true';
  if (cursor) {
    params.push(cursor);
    where += ` AND p.updated_at < $${params.length}`;
  }
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT p.user_id AS "userId", p.display_name AS "displayName", p.gender, p.bio,
           p.relationship_goal AS "relationshipGoal", p.updated_at AS "updatedAt",
           u.email,
           (SELECT url FROM profile_photos WHERE user_id = p.user_id AND is_primary = true LIMIT 1) AS "primaryPhoto"
    FROM profiles p
    JOIN users u ON p.user_id = u.id
    ${where}
    ORDER BY p.updated_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].updatedAt : null;

  return { items, nextCursor, hasMore };
}

async function updateContentModerationStatus(contentType, contentId, status) {
  if (contentType === 'feed' || contentType === 'post') {
    await query(`UPDATE posts SET moderation_status = $1, updated_at = NOW() WHERE id = $2`, [status, contentId]);
  } else if (contentType === 'photo' || contentType === 'photos') {
    await query(`UPDATE profile_photos SET moderation_status = $1 WHERE id = $2`, [status, contentId]);
  } else if (contentType === 'comment' || contentType === 'comments') {
    await query(`UPDATE post_comments SET moderation_status = $1 WHERE id = $2`, [status, contentId]);
  }
}

module.exports = {
  listFeedContent,
  listPhotos,
  listComments,
  listProfilesPendingReview,
  updateContentModerationStatus,
};
