const { query, withTransaction } = require('../../infrastructure/database/pool');
const { UnauthorizedError, ForbiddenError, NotFoundError } = require('../../shared/errors');
const notificationService = require('../notifications/notifications.service');

async function getFeedPosts(userId, limit = 20) {
  // Determine viewer's preferred gender for feed prioritization
  const preferredGenders = [];
  try {
    const userPrefRes = await query(
      `SELECT p.gender, up.interested_in AS "interestedIn"
       FROM profiles p
       LEFT JOIN user_preferences up ON up.user_id = p.user_id
       WHERE p.user_id = $1`,
      [userId]
    );
    if (userPrefRes.rows.length > 0) {
      const { gender, interestedIn } = userPrefRes.rows[0];
      const normGender = (gender || '').toLowerCase();

      // If user has an exclusive single-gender preference (e.g. ['Women'] or ['Men'])
      if (interestedIn && Array.isArray(interestedIn) && interestedIn.length === 1 && !interestedIn.includes('Everyone')) {
        const pref = interestedIn[0];
        if (pref === 'Men' || pref === 'Man') preferredGenders.push('Man', 'Men');
        else if (pref === 'Women' || pref === 'Woman') preferredGenders.push('Woman', 'Women');
        else preferredGenders.push(pref);
      } else {
        // Standard rule: Man sees Women first, Woman sees Men first
        if (normGender.includes('man') && !normGender.includes('wo')) {
          preferredGenders.push('Woman', 'Women');
        } else if (normGender.includes('woman') || normGender.includes('women')) {
          preferredGenders.push('Man', 'Men');
        }
      }
    }
  } catch (_) {}

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
      prof.gender AS "authorGender",
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
    WHERE NOT EXISTS (
      SELECT 1 FROM blocks b
      WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = p.user_id)
         OR (b.blocker_user_id = p.user_id AND b.blocked_user_id = $1)
    )
    ORDER BY
      CASE
        WHEN p.user_id = $1 THEN 0
        WHEN $3::varchar[] IS NOT NULL AND array_length($3::varchar[], 1) > 0 AND prof.gender = ANY($3::varchar[]) THEN 1
        WHEN $3::varchar[] IS NULL OR array_length($3::varchar[], 1) IS NULL THEN 1
        ELSE 2
      END ASC,
      p.created_at DESC
    LIMIT $2
  `;

  let res;
  try {
    res = await query(sql, [userId, limit, preferredGenders]);
  } catch (err) {
    if (err.message && err.message.includes('is_edited')) {
      await query(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE;`).catch(() => {});
      res = await query(sql, [userId, limit, preferredGenders]);
    } else {
      throw err;
    }
  }
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

async function assertCanInteractWithPost(userId, postId) {
  const res = await query(
    `SELECT p.user_id AS "authorId"
     FROM posts p
     WHERE p.id = $2
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = p.user_id)
            OR (b.blocked_user_id = $1 AND b.blocker_user_id = p.user_id)
       )`,
    [userId, postId]
  );
  if (res.rows.length === 0) {
    throw new ForbiddenError('You cannot interact with this post', 'USER_INTERACTION_BLOCKED');
  }
  return res.rows[0].authorId;
}

async function togglePostLike(userId, postId) {
  const authorId = await assertCanInteractWithPost(userId, postId);
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

    return { liked: true };
  }
}

async function getPostComments(postId, userId) {
  await assertCanInteractWithPost(userId, postId);
  const res = await query(
    `SELECT
       c.id,
       c.user_id AS "userId",
       c.comment_text AS "commentText",
       c.parent_comment_id AS "parentCommentId",
       c.reply_to_user_id AS "replyToUserId",
       c.created_at AS "createdAt",
       prof.display_name AS "authorName",
       (
         SELECT display_name FROM profiles
         WHERE user_id = (SELECT user_id FROM post_comments WHERE id = c.parent_comment_id)
       ) AS "replyToUserName",
       (
         SELECT url FROM profile_photos
         WHERE user_id = c.user_id
         ORDER BY display_order ASC LIMIT 1
       ) AS "authorAvatar"
     FROM post_comments c
     JOIN profiles prof ON prof.user_id = c.user_id
     WHERE c.post_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_user_id = $2 AND b.blocked_user_id = c.user_id)
            OR (b.blocked_user_id = $2 AND b.blocker_user_id = c.user_id)
       )
     ORDER BY c.created_at ASC`,
    [postId, userId]
  );
  return res.rows;
}

async function addPostComment(userId, postId, commentText, parentCommentId = null) {
  await assertCanInteractWithPost(userId, postId);
  let replyToUserId = null;
  if (parentCommentId) {
    const parentCheck = await query(`SELECT user_id FROM post_comments WHERE id = $1`, [parentCommentId]);
    if (parentCheck.rows.length > 0) {
      replyToUserId = parentCheck.rows[0].user_id;
    }
  }

  const res = await query(
    `INSERT INTO post_comments (user_id, post_id, comment_text, parent_comment_id, reply_to_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id, user_id AS "userId", comment_text AS "commentText", parent_comment_id AS "parentCommentId", reply_to_user_id AS "replyToUserId", created_at AS "createdAt"`,
    [userId, postId, commentText, parentCommentId || null, replyToUserId]
  );
  const comment = res.rows[0];
  const userProf = await query(
    `SELECT prof.display_name AS "authorName",
       (SELECT url FROM profile_photos WHERE user_id = $1 ORDER BY display_order ASC LIMIT 1) AS "authorAvatar"
     FROM profiles prof WHERE prof.user_id = $1`,
    [userId]
  );

  const senderName = userProf.rows[0]?.authorName || 'Someone';
  const snippet = commentText.length > 40 ? `${commentText.substring(0, 37)}...` : commentText;

  // If this is a reply to another comment, notify the parent comment author
  if (replyToUserId && replyToUserId !== userId) {
    notificationService.createNotification({
      recipientId: replyToUserId,
      senderId: userId,
      type: 'comment',
      entityId: postId,
      message: `${senderName} replied to your comment: "${snippet}"`,
    }).catch(() => {});
  }

  // Also notify post author (if not the sender and not the parent comment author already notified)
  const postRes = await query(`SELECT user_id FROM posts WHERE id = $1`, [postId]);
  if (postRes.rows.length > 0) {
    const authorId = postRes.rows[0].user_id;
    if (authorId !== userId && authorId !== replyToUserId) {
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

  let replyToUserName = null;
  if (replyToUserId) {
    const targetProf = await query(`SELECT display_name FROM profiles WHERE user_id = $1`, [replyToUserId]);
    replyToUserName = targetProf.rows[0]?.display_name || null;
  }

  return {
    ...comment,
    authorName: userProf.rows[0]?.authorName || 'Me',
    authorAvatar: userProf.rows[0]?.authorAvatar || '',
    replyToUserName,
  };
}

async function deletePostComment(userId, postId, commentId) {
  const commentCheck = await query(
    `SELECT c.user_id, p.user_id AS "postAuthorId"
     FROM post_comments c
     JOIN posts p ON p.id = c.post_id
     WHERE c.id = $1 AND c.post_id = $2`,
    [commentId, postId]
  );
  if (commentCheck.rows.length === 0) {
    throw new NotFoundError('Comment not found');
  }
  const { user_id: commentAuthorId, postAuthorId } = commentCheck.rows[0];
  if (commentAuthorId !== userId && postAuthorId !== userId) {
    throw new UnauthorizedError('You can only delete your own comments or comments on your posts');
  }
  await query(`DELETE FROM post_comments WHERE id = $1`, [commentId]);
  return true;
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
  deletePostComment,
};
