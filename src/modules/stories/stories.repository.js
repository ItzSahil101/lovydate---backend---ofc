const { query, withTransaction } = require('../../infrastructure/database/pool');
const { BadRequestError, ForbiddenError } = require('../../shared/errors');

const STORY_ACCESS_SQL = `
  s.deleted_at IS NULL
  AND s.expires_at > NOW()
  AND (
    s.user_id = $1
    OR (
      NOT EXISTS (
        SELECT 1
        FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = s.user_id)
           OR (b.blocker_user_id = s.user_id AND b.blocked_user_id = $1)
      )
      AND (
        s.visibility = 'everyone'
        OR (
          s.visibility = 'matches'
          AND EXISTS (
            SELECT 1
            FROM matches m
            WHERE (
              (m.user_one_id = $1 AND m.user_two_id = s.user_id)
              OR (m.user_two_id = $1 AND m.user_one_id = s.user_id)
            )
            AND m.unmatched_at IS NULL
          )
        )
        OR (
          s.visibility = 'selected'
          AND EXISTS (
            SELECT 1
            FROM story_allowed_viewers sav
            WHERE sav.story_id = s.id
              AND sav.viewer_user_id = $1
          )
        )
      )
    )
  )
`;

async function createStory(userId, data, allowedViewerIds = []) {
  return withTransaction(async (client) => {
    if (data.visibility === 'selected' && allowedViewerIds.length > 0) {
      const validation = await client.query(
        `SELECT
           COUNT(*)::int AS requested_count,
           COUNT(u.id)::int AS existing_count,
           COUNT(*) FILTER (
             WHERE v.viewer_id = $1
           )::int AS self_count,
           COUNT(*) FILTER (
             WHERE EXISTS (
               SELECT 1
               FROM blocks b
               WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = v.viewer_id)
                  OR (b.blocker_user_id = v.viewer_id AND b.blocked_user_id = $1)
             )
           )::int AS blocked_count
         FROM (
           SELECT DISTINCT viewer_id
           FROM unnest($2::uuid[]) AS input(viewer_id)
         ) v
         LEFT JOIN users u ON u.id = v.viewer_id`,
        [userId, allowedViewerIds]
      );

      const check = validation.rows[0];

      if (check.self_count > 0) {
        throw new BadRequestError(
          "You cannot add yourself as a selected viewer",
          "INVALID_VIEWER"
        );
      }

      if (check.existing_count !== check.requested_count) {
        throw new BadRequestError(
          "One or more selected viewers do not exist",
          "INVALID_VIEWERS"
        );
      }

      if (check.blocked_count > 0) {
        throw new ForbiddenError(
          "You cannot select users with a block relationship",
          "VIEWER_BLOCKED"
        );
      }
    }

    const result = await client.query(
      `INSERT INTO stories (
         user_id, media_key, media_type, mime_type,
         media_size_bytes, duration_seconds, caption,
         visibility, moderation_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'approved')
       RETURNING
         id, user_id AS "userId", media_key AS "mediaKey",
         media_type AS "mediaType", mime_type AS "mimeType",
         media_size_bytes AS "mediaSizeBytes",
         duration_seconds AS "durationSeconds",
         caption, visibility, moderation_status AS "moderationStatus",
         created_at AS "createdAt", expires_at AS "expiresAt"`,
      [
        userId,
        data.mediaKey,
        data.mediaType,
        data.mimeType,
        data.mediaSizeBytes,
        data.durationSeconds,
        data.caption || null,
        data.visibility,
      ]
    );

    const story = result.rows[0];

    if (data.visibility === 'selected' && allowedViewerIds.length > 0) {
      await client.query(
        `INSERT INTO story_allowed_viewers (story_id, viewer_user_id)
         SELECT $1, viewer_id
         FROM unnest($2::uuid[]) AS viewer_id
         ON CONFLICT DO NOTHING`,
        [story.id, allowedViewerIds]
      );
    }

    return story;
  });
}

async function getStoryForViewer(storyId, viewerId) {
  const result = await query(
    `SELECT
       s.id,
       s.user_id AS "userId",
       s.media_key AS "mediaKey",
       s.media_type AS "mediaType",
       s.mime_type AS "mimeType",
       s.media_size_bytes AS "mediaSizeBytes",
       s.duration_seconds AS "durationSeconds",
       s.caption,
       s.visibility,
       s.moderation_status AS "moderationStatus",
       s.created_at AS "createdAt",
       s.expires_at AS "expiresAt",
       (SELECT COUNT(*)::int FROM story_reactions sr WHERE sr.story_id = s.id) AS "reactionCount",
       (SELECT sr.reaction FROM story_reactions sr WHERE sr.story_id = s.id AND sr.user_id = $1 LIMIT 1) AS "myReaction"
     FROM stories s
     WHERE s.id = $2
       AND ${STORY_ACCESS_SQL}
     LIMIT 1`,
    [viewerId, storyId]
  );

  return result.rows[0] || null;
}

async function getStoryByMediaKeyForViewer(mediaKey, viewerId) {
  const result = await query(
    `SELECT
       s.id,
       s.user_id AS "userId",
       s.media_key AS "mediaKey",
       s.media_type AS "mediaType",
       s.mime_type AS "mimeType",
       s.media_size_bytes AS "mediaSizeBytes",
       s.duration_seconds AS "durationSeconds",
       s.caption,
       s.visibility,
       s.moderation_status AS "moderationStatus",
       s.created_at AS "createdAt",
       s.expires_at AS "expiresAt"
     FROM stories s
     WHERE s.media_key = $2
       AND ${STORY_ACCESS_SQL}
     LIMIT 1`,
    [viewerId, mediaKey]
  );

  return result.rows[0] || null;
}

async function getStoriesForViewer(viewerId, limit = 50) {
  const result = await query(
    `SELECT
       s.id,
       s.user_id AS "userId",
       s.media_type AS "mediaType",
       s.caption,
       s.visibility,
       s.created_at AS "createdAt",
       s.expires_at AS "expiresAt",
       p.display_name AS "displayName",
       (
         SELECT pp.url
         FROM profile_photos pp
         WHERE pp.user_id = s.user_id
         ORDER BY pp.is_primary DESC, pp.display_order ASC
         LIMIT 1
       ) AS "avatarUrl",
       EXISTS (
         SELECT 1 FROM story_views sv
         WHERE sv.story_id = s.id AND sv.viewer_user_id = $1
       ) AS "viewed",
       (SELECT COUNT(*)::int FROM story_reactions sr WHERE sr.story_id = s.id) AS "reactionCount",
       (SELECT sr.reaction FROM story_reactions sr WHERE sr.story_id = s.id AND sr.user_id = $1 LIMIT 1) AS "myReaction"
     FROM stories s
     JOIN profiles p ON p.user_id = s.user_id
     WHERE ${STORY_ACCESS_SQL}
     ORDER BY s.created_at DESC
     LIMIT $2`,
    [viewerId, limit]
  );

  return result.rows;
}


async function createStoryReply(storyId, senderId, message) {
  const result = await query(
    `INSERT INTO story_replies (
       story_id, sender_user_id, message
     )
     SELECT s.id, $1, $3
     FROM stories s
     WHERE s.id = $2
       AND s.user_id <> $1
       AND ${STORY_ACCESS_SQL}
     RETURNING
       id,
       story_id AS "storyId",
       sender_user_id AS "senderId",
       message,
       moderation_status AS "moderationStatus",
       created_at AS "createdAt"`,
    [senderId, storyId, message]
  );

  return result.rows[0] || null;
}

async function getStoryReplies(storyId, viewerId, limit = 50) {
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || 50, 1),
    100
  );

  const result = await query(
    `SELECT
       sr.id,
       sr.story_id AS "storyId",
       sr.sender_user_id AS "senderId",
       p.display_name AS "senderName",
       sr.message,
       sr.moderation_status AS "moderationStatus",
       sr.created_at AS "createdAt"
     FROM story_replies sr
     JOIN stories s ON s.id = sr.story_id
     JOIN profiles p ON p.user_id = sr.sender_user_id
     WHERE s.id = $2
       AND ${STORY_ACCESS_SQL}
       AND (
         s.user_id = $1
         OR sr.sender_user_id = $1
       )
       AND (
         sr.moderation_status = 'approved'
         OR sr.sender_user_id = $1
       )
     ORDER BY sr.created_at ASC
     LIMIT $3`,
    [viewerId, storyId, safeLimit]
  );

  return result.rows;
}


async function recordStoryView(storyId, viewerId) {
  const result = await query(
    `INSERT INTO story_views (story_id, viewer_user_id)
     SELECT s.id, $1
     FROM stories s
     WHERE s.id = $2
       AND s.user_id <> $1
       AND ${STORY_ACCESS_SQL}
     ON CONFLICT (story_id, viewer_user_id)
     DO UPDATE SET viewed_at = NOW()
     RETURNING story_id AS "storyId", viewed_at AS "viewedAt"`,
    [viewerId, storyId]
  );

  return result.rows[0] || null;
}
async function deleteStory(storyId, userId) {
  const result = await query(
    `UPDATE stories
     SET deleted_at = NOW()
     WHERE id = $1
       AND user_id = $2
       AND deleted_at IS NULL
     RETURNING id, media_key AS "mediaKey"`,
    [storyId, userId]
  );

  return result.rows[0] || null;
}

async function claimStoryMediaCleanup(limit = 20) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);

  return withTransaction(async (client) => {
    const candidates = await client.query(
      `SELECT id
       FROM stories
       WHERE media_deleted_at IS NULL
         AND (
           deleted_at IS NOT NULL
           OR (
             expires_at <= NOW()
             AND NOT EXISTS (
               SELECT 1
               FROM story_highlight_items shi
               WHERE shi.story_id = stories.id
             )
           )
         )
         AND (
           cleanup_next_attempt_at IS NULL
           OR cleanup_next_attempt_at <= NOW()
         )
       ORDER BY COALESCE(cleanup_next_attempt_at, expires_at), expires_at
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [safeLimit]
    );

    if (!candidates.rowCount) return [];

    const ids = candidates.rows.map((row) => row.id);

    // Recheck membership in a new statement after candidate locks are acquired.
    const eligible = await client.query(
      `SELECT s.id
       FROM stories s
       WHERE s.id = ANY($1::uuid[])
         AND s.media_deleted_at IS NULL
         AND (
           s.deleted_at IS NOT NULL
           OR (
             s.expires_at <= NOW()
             AND NOT EXISTS (
               SELECT 1
               FROM story_highlight_items shi
               WHERE shi.story_id = s.id
             )
           )
         )
         AND (
           s.cleanup_next_attempt_at IS NULL
           OR s.cleanup_next_attempt_at <= NOW()
         )`,
      [ids]
    );

    const eligibleIds = eligible.rows.map((row) => row.id);
    if (!eligibleIds.length) return [];

    const claimed = await client.query(
      `UPDATE stories s
       SET cleanup_attempts = s.cleanup_attempts + 1,
           cleanup_next_attempt_at = NOW() + INTERVAL '15 minutes',
           cleanup_last_error = NULL
       WHERE s.id = ANY($1::uuid[])
         AND s.media_deleted_at IS NULL
       RETURNING s.id, s.media_key AS "mediaKey",
                 s.cleanup_attempts AS "cleanupAttempts"`,
      [eligibleIds]
    );

    return claimed.rows;
  });
}

async function markStoryMediaDeleted(storyId) {
  const result = await query(
    `UPDATE stories
     SET media_deleted_at = NOW(),
         cleanup_next_attempt_at = NULL,
         cleanup_last_error = NULL
     WHERE id = $1
       AND media_deleted_at IS NULL
     RETURNING id`,
    [storyId]
  );

  return result.rowCount > 0;
}

async function recordStoryMediaCleanupFailure(storyId, error) {
  const message = String(error?.message || error || "Unknown S3 cleanup error").slice(0, 1000);

  const result = await query(
    `UPDATE stories
     SET cleanup_last_error = $2,
         cleanup_next_attempt_at =
           NOW() + (
             LEAST(3600, 30 * POWER(2, LEAST(cleanup_attempts - 1, 7)))
             * INTERVAL '1 second'
           )
     WHERE id = $1
       AND media_deleted_at IS NULL
     RETURNING id, cleanup_attempts AS "cleanupAttempts"`,
    [storyId, message]
  );

  return result.rows[0] || null;
}
module.exports = {
  createStory,
  getStoryForViewer,
  getStoryByMediaKeyForViewer,
  getStoriesForViewer,
  recordStoryView,
  deleteStory,
  claimStoryMediaCleanup,
  markStoryMediaDeleted,
  recordStoryMediaCleanupFailure,
  createStoryReply,
  getStoryReplies,
};








