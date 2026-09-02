const { query } = require('../../../infrastructure/database/pool');

async function listFeedPosts({ tab = 'recent', search, limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (tab === 'removed') {
    conditions.push(`p.moderation_status = 'removed'`);
  } else if (tab === 'reported') {
    conditions.push(`rep.reports_count > 0`);
  } else if (tab === 'trending') {
    conditions.push(`p.moderation_status != 'removed'`);
  } else {
    // recent
    conditions.push(`p.moderation_status != 'removed'`);
  }

  if (search) {
    params.push(`%${search.trim().toLowerCase()}%`);
    conditions.push(`(
      LOWER(p.content) LIKE $${params.length}
      OR LOWER(prof.display_name) LIKE $${params.length}
      OR p.id::text = '${search.trim()}'
    )`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`p.created_at < $${params.length}`);
  }

  let orderBy = 'ORDER BY p.created_at DESC';
  if (tab === 'trending') {
    orderBy = 'ORDER BY likes_count DESC, p.created_at DESC';
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT p.id, p.user_id AS "userId", p.content, p.location_name AS "locationName",
           p.moderation_status AS "moderationStatus", p.is_comments_disabled AS "isCommentsDisabled",
           p.created_at AS "createdAt",
           prof.display_name AS "authorName", u.email AS "authorEmail",
           (SELECT url FROM profile_photos WHERE user_id = p.user_id AND is_primary = true LIMIT 1) AS "authorAvatar",
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
    ${orderBy}
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function getPostDetail(postId) {
  const postRes = await query(
    `SELECT p.id, p.user_id AS "userId", p.content, p.location_name AS "locationName",
            p.moderation_status AS "moderationStatus", p.is_comments_disabled AS "isCommentsDisabled",
            p.created_at AS "createdAt",
            prof.display_name AS "authorName", u.email AS "authorEmail",
            (SELECT url FROM profile_photos WHERE user_id = p.user_id AND is_primary = true LIMIT 1) AS "authorAvatar",
            COALESCE(array_agg(DISTINCT ph.url) FILTER (WHERE ph.url IS NOT NULL), '{}') AS photos
     FROM posts p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN profiles prof ON p.user_id = prof.user_id
     LEFT JOIN post_photos ph ON p.id = ph.post_id
     WHERE p.id = $1
     GROUP BY p.id, p.user_id, p.content, p.location_name, p.moderation_status, p.is_comments_disabled, p.created_at, prof.display_name, u.email`,
    [postId]
  );

  if (postRes.rows.length === 0) return null;
  const post = postRes.rows[0];

  const commentsRes = await query(
    `SELECT c.id, c.user_id AS "userId", c.comment_text AS "commentText", c.created_at AS "createdAt",
            prof.display_name AS "authorName"
     FROM post_comments c
     LEFT JOIN profiles prof ON c.user_id = prof.user_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );

  return {
    ...post,
    comments: commentsRes.rows,
  };
}

async function togglePostComments(postId, disable) {
  await query(`UPDATE posts SET is_comments_disabled = $1, updated_at = NOW() WHERE id = $2`, [disable, postId]);
}

module.exports = {
  listFeedPosts,
  getPostDetail,
  togglePostComments,
};
