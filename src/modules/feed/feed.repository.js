const { query, withTransaction } = require('../../infrastructure/database/pool');
const { UnauthorizedError, NotFoundError } = require('../../shared/errors');
const notificationService = require('../notifications/notifications.service');

async function getFeedPosts(userId, limit = 20) {
  const sql = `
    SELECT
      p.id,
      p.user_id AS "userId",
      p.content,
      p.location_name AS "locationName",
      p.created_at AS "createdAt",
      p.updated_at AS "updatedAt",
      COALESCE(p.is_edited, FALSE) AS "isEdited",
      prof.display_name AS "authorName",
      (u.email_verified_at IS NOT NULL) AS "isVerified",
      (
        SELECT url FROM profile_photos
        WHERE user_id = p.user_id
        ORDER BY display_order ASC LIMIT 1
      ) AS "authorAvatar",
      (
        SELECT COUNT(*)::int FROM post_likes WHERE post_id = p.id
      ) AS "likesCount",
      (
        SELECT COUNT(*)::int FROM post_comments WHERE post_id = p.id
      ) AS "commentsCount",
      EXISTS (
        SELECT 1 FROM post_likes WHERE post_id = p.id AND user_id = $1
      ) AS "isLiked"
    FROM posts p
    JOIN profiles prof ON prof.user_id = p.user_id
    JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC
    LIMIT $2
  `;

  const res = await query(sql, [userId, limit]);
  const posts = res.rows;

  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const photosRes = await query(
    `SELECT post_id AS "postId", url, display_order AS "displayOrder"
     FROM post_photos
     WHERE post_id = ANY($1::uuid[])
     ORDER BY display_order ASC`,
    [postIds]
  );

  const photosMap = {};
  photosRes.rows.forEach((ph) => {
    if (!photosMap[ph.postId]) photosMap[ph.postId] = [];
    photosMap[ph.postId].push(ph.url);
  });

  return posts.map((post) => ({
    ...post,
    photos: photosMap[post.id] || [],
  }));
}

async function createPost(userId, { content, locationName = null, photos = [] }) {
  const post = await withTransaction(async (client) => {
    const postRes = await client.query(
      `INSERT INTO posts (user_id, content, location_name, is_edited, created_at, updated_at)
       VALUES ($1, $2, $3, FALSE, NOW(), NOW())
       RETURNING id, user_id AS "userId", content, location_name AS "locationName", is_edited AS "isEdited", created_at AS "createdAt"`,
      [userId, content, locationName]
    );

    const inserted = postRes.rows[0];

    if (Array.isArray(photos) && photos.length > 0) {
      for (let i = 0; i < photos.length; i++) {
        await client.query(
          `INSERT INTO post_photos (post_id, url, display_order, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [inserted.id, photos[i], i]
        );
      }
    }

    const userProf = await client.query(
      `SELECT display_name AS "authorName" FROM profiles WHERE user_id = $1`,
      [userId]
    );
    const userPhoto = await client.query(
      `SELECT url FROM profile_photos WHERE user_id = $1 ORDER BY display_order ASC LIMIT 1`,
      [userId]
    );

    return {
      ...inserted,
      authorName: userProf.rows[0]?.authorName || 'Me',
      authorAvatar: userPhoto.rows[0]?.url || '',
      isVerified: true,
      photos,
      likesCount: 0,
      commentsCount: 0,
      isLiked: false,
    };
  });

  // Notify any mentioned users asynchronously
  if (content) {
    notificationService.notifyMentions({
      senderId: userId,
      text: content,
      entityId: post.id,
      type: 'mention',
    }).catch(() => {});
  }

  return post;
}

async function updatePost(userId, postId, { content, locationName = null, photos = null }) {
  const check = await query(`SELECT user_id, content FROM posts WHERE id = $1`, [postId]);
  if (check.rows.length === 0) {
    throw new NotFoundError('Post not found');
  }
  if (check.rows[0].user_id !== userId) {
    throw new UnauthorizedError('You can only edit your own posts');
  }

  const updated = await withTransaction(async (client) => {
    const postRes = await client.query(
      `UPDATE posts
       SET content = $1, location_name = $2, is_edited = TRUE, updated_at = NOW()
       WHERE id = $3
       RETURNING id, user_id AS "userId", content, location_name AS "locationName", is_edited AS "isEdited", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [content, locationName, postId]
    );

    const row = postRes.rows[0];

    if (Array.isArray(photos)) {
      await client.query(`DELETE FROM post_photos WHERE post_id = $1`, [postId]);
      for (let i = 0; i < photos.length; i++) {
        await client.query(
          `INSERT INTO post_photos (post_id, url, display_order, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [postId, photos[i], i]
        );
      }
    }

    const currentPhotos = await client.query(
      `SELECT url FROM post_photos WHERE post_id = $1 ORDER BY display_order ASC`,
      [postId]
    );

    const userProf = await client.query(
      `SELECT display_name AS "authorName" FROM profiles WHERE user_id = $1`,
      [userId]
    );
    const userPhoto = await client.query(
      `SELECT url FROM profile_photos WHERE user_id = $1 ORDER BY display_order ASC LIMIT 1`,
      [userId]
    );
    const counts = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM post_likes WHERE post_id = $1) AS "likesCount",
         (SELECT COUNT(*)::int FROM post_comments WHERE post_id = $1) AS "commentsCount",
         EXISTS (SELECT 1 FROM post_likes WHERE post_id = $1 AND user_id = $2) AS "isLiked"`,
      [postId, userId]
    );

    return {
      ...row,
      authorName: userProf.rows[0]?.authorName || 'Me',
      authorAvatar: userPhoto.rows[0]?.url || '',
      isVerified: true,
      photos: currentPhotos.rows.map((p) => p.url),
      likesCount: counts.rows[0]?.likesCount || 0,
      commentsCount: counts.rows[0]?.commentsCount || 0,
      isLiked: counts.rows[0]?.isLiked || false,
    };
  });

  // Notify any newly mentioned users
  if (content) {
    notificationService.notifyMentions({
      senderId: userId,
      text: content,
      entityId: postId,
      type: 'mention',
    }).catch(() => {});
  }

  return updated;
}

async function deletePost(userId, postId) {
  const check = await query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
  if (check.rows.length === 0) {
    throw new NotFoundError('Post not found');
  }
  if (check.rows[0].user_id !== userId) {
    throw new UnauthorizedError('You can only delete your own posts');
  }
  await query(`DELETE FROM posts WHERE id = $1`, [postId]);
  return true;
}

async function reportPost(userId, postId, reason = 'Inappropriate content') {
  await query(
    `CREATE TABLE IF NOT EXISTS post_reports (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       user_id UUID REFERENCES users(id) ON DELETE CASCADE,
       post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
       reason TEXT,
       created_at TIMESTAMPTZ DEFAULT NOW()
     )`
  );
  await query(
    `INSERT INTO post_reports (user_id, post_id, reason, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [userId, postId, reason]
  );
  return { reported: true };
}

async function togglePostLike(userId, postId) {
  const existing = await query(
    `SELECT 1 FROM post_likes WHERE user_id = $1 AND post_id = $2`,
    [userId, postId]
  );

  if (existing.rows.length > 0) {
    await query(`DELETE FROM post_likes WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
    return { liked: false };
  } else {
    await query(
      `INSERT INTO post_likes (user_id, post_id, created_at) VALUES ($1, $2, NOW())`,
      [userId, postId]
    );

    // Send notification to post author
    const postRes = await query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
    if (postRes.rows.length > 0) {
      const authorId = postRes.rows[0].user_id;
      if (authorId !== userId) {
        const senderProf = await query(
          `SELECT display_name AS "senderName" FROM profiles WHERE user_id = $1`,
          [userId]
        );
        const senderName = senderProf.rows[0]?.senderName || 'Someone';

        notificationService.createNotification({
          recipientId: authorId,
          senderId: userId,
          type: 'like',
          entityId: postId,
          message: `${senderName} liked your post`,
        }).catch(() => {});
      }
    }

    return { liked: true };
  }
}

async function getPostComments(postId) {
  const res = await query(
    `SELECT
       c.id,
       c.user_id AS "userId",
       c.comment_text AS "commentText",
       c.created_at AS "createdAt",
       prof.display_name AS "authorName",
       (
         SELECT url FROM profile_photos
         WHERE user_id = c.user_id
         ORDER BY display_order ASC LIMIT 1
       ) AS "authorAvatar"
     FROM post_comments c
     JOIN profiles prof ON prof.user_id = c.user_id
     WHERE c.post_id = $1
     ORDER BY c.created_at ASC`,
    [postId]
  );
  return res.rows;
}

async function addPostComment(userId, postId, commentText) {
  const res = await query(
    `INSERT INTO post_comments (user_id, post_id, comment_text, created_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id, user_id AS "userId", comment_text AS "commentText", created_at AS "createdAt"`,
    [userId, postId, commentText]
  );
  const comment = res.rows[0];
  const userProf = await query(
    `SELECT prof.display_name AS "authorName",
       (SELECT url FROM profile_photos WHERE user_id = $1 ORDER BY display_order ASC LIMIT 1) AS "authorAvatar"
     FROM profiles prof WHERE prof.user_id = $1`,
    [userId]
  );

  const senderName = userProf.rows[0]?.authorName || 'Someone';

  // Send comment notification to post author
  const postRes = await query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
  if (postRes.rows.length > 0) {
    const authorId = postRes.rows[0].user_id;
    if (authorId !== userId) {
      const snippet = commentText.length > 40 ? `${commentText.substring(0, 37)}...` : commentText;
      notificationService.createNotification({
        recipientId: authorId,
        senderId: userId,
        type: 'comment',
        entityId: postId,
        message: `${senderName} commented: "${snippet}"`,
      }).catch(() => {});
    }
  }

  // Also notify mentions in comment
  notificationService.notifyMentions({
    senderId: userId,
    text: commentText,
    entityId: postId,
    type: 'mention',
  }).catch(() => {});

  return {
    ...comment,
    authorName: userProf.rows[0]?.authorName || 'Me',
    authorAvatar: userProf.rows[0]?.authorAvatar || '',
  };
}

module.exports = {
  getFeedPosts,
  createPost,
  updatePost,
  deletePost,
  reportPost,
  togglePostLike,
  getPostComments,
  addPostComment,
};
