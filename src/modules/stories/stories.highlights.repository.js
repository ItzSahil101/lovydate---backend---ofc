const { query, withTransaction } = require("../../infrastructure/database/pool");

const HIGHLIGHT_STORY_ACCESS_SQL = `
  s.deleted_at IS NULL
  AND s.media_deleted_at IS NULL
  AND (
    s.expires_at > NOW()
    OR EXISTS (
      SELECT 1
      FROM story_highlight_items shi
      WHERE shi.story_id = s.id
    )
  )
  AND (
    s.user_id = $1
    OR (
      s.moderation_status = 'approved'
      AND NOT EXISTS (
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

async function createHighlight(userId, title) {
  const result = await query(
    `INSERT INTO story_highlights (user_id, title)
     VALUES ($1, $2)
     RETURNING
       id,
       user_id AS "userId",
       title,
       cover_story_id AS "coverStoryId",
       display_order AS "displayOrder",
       created_at AS "createdAt",
       updated_at AS "updatedAt"`,
    [userId, title]
  );

  return result.rows[0] || null;
}

async function listHighlightsForViewer(ownerId, viewerId) {
  const result = await query(
    `SELECT
       h.id,
       h.user_id AS "userId",
       h.title,
       h.display_order AS "displayOrder",
       h.created_at AS "createdAt",
       h.updated_at AS "updatedAt",
       COUNT(s.id)::int AS "storyCount",
       COALESCE(
         h.cover_story_id,
         (ARRAY_AGG(s.id ORDER BY hi.display_order, hi.added_at)
           FILTER (WHERE s.id IS NOT NULL))[1]
       ) AS "coverStoryId",
       COALESCE(
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', s.id,
             'mediaType', s.media_type,
             'caption', s.caption,
             'createdAt', s.created_at,
             'expiresAt', s.expires_at,
             'displayOrder', hi.display_order
           )
           ORDER BY hi.display_order, hi.added_at
         ) FILTER (WHERE s.id IS NOT NULL),
         '[]'::jsonb
       ) AS stories
     FROM story_highlights h
     LEFT JOIN story_highlight_items hi
       ON hi.highlight_id = h.id
     LEFT JOIN stories s
       ON s.id = hi.story_id
       AND ${HIGHLIGHT_STORY_ACCESS_SQL}
     WHERE h.user_id = $2
     GROUP BY h.id
     HAVING COUNT(s.id) > 0
     ORDER BY h.display_order ASC, h.created_at DESC`,
    [viewerId, ownerId]
  );

  return result.rows;
}

async function getHighlightForViewer(highlightId, viewerId) {
  const result = await query(
    `SELECT
       h.id,
       h.user_id AS "userId",
       h.title,
       h.display_order AS "displayOrder",
       h.created_at AS "createdAt",
       h.updated_at AS "updatedAt",
       COALESCE(
         h.cover_story_id,
         (ARRAY_AGG(s.id ORDER BY hi.display_order, hi.added_at)
           FILTER (WHERE s.id IS NOT NULL))[1]
       ) AS "coverStoryId",
       COALESCE(
         JSONB_AGG(
           JSONB_BUILD_OBJECT(
             'id', s.id,
             'mediaType', s.media_type,
             'caption', s.caption,
             'createdAt', s.created_at,
             'expiresAt', s.expires_at,
             'displayOrder', hi.display_order
           )
           ORDER BY hi.display_order, hi.added_at
         ) FILTER (WHERE s.id IS NOT NULL),
         '[]'::jsonb
       ) AS stories
     FROM story_highlights h
     LEFT JOIN story_highlight_items hi
       ON hi.highlight_id = h.id
     LEFT JOIN stories s
       ON s.id = hi.story_id
       AND ${HIGHLIGHT_STORY_ACCESS_SQL}
     WHERE h.id = $2
     GROUP BY h.id
     HAVING COUNT(s.id) > 0`,
    [viewerId, highlightId]
  );

  return result.rows[0] || null;
}

async function addStoryToHighlight(userId, highlightId, storyId) {
  return withTransaction(async (client) => {
    const storyLock = await client.query(
      `SELECT id
       FROM stories
       WHERE id = $1
         AND user_id = $2
         AND deleted_at IS NULL
         AND media_deleted_at IS NULL
         AND expires_at > NOW()
         AND (
           cleanup_next_attempt_at IS NULL
           OR cleanup_next_attempt_at <= NOW()
         )
       FOR UPDATE`,
      [storyId, userId]
    );

    if (!storyLock.rowCount) return null;

    const ownership = await client.query(
      `SELECT h.id
       FROM story_highlights h
       JOIN stories s ON s.user_id = h.user_id
       WHERE h.id = $1
         AND h.user_id = $2
         AND s.id = $3
         AND s.deleted_at IS NULL
         AND s.media_deleted_at IS NULL
         AND s.expires_at > NOW()
       FOR UPDATE OF h`,
      [highlightId, userId, storyId]
    );

    if (!ownership.rows[0]) {
      return null;
    }

    const inserted = await client.query(
      `INSERT INTO story_highlight_items (
         highlight_id, story_id
       )
       VALUES ($1, $2)
       ON CONFLICT (highlight_id, story_id) DO NOTHING
       RETURNING highlight_id AS "highlightId",
                 story_id AS "storyId",
                 display_order AS "displayOrder",
                 added_at AS "addedAt"`,
      [highlightId, storyId]
    );

    await client.query(
      `UPDATE story_highlights
       SET cover_story_id = COALESCE(cover_story_id, $3),
           updated_at = NOW()
       WHERE id = $1
         AND user_id = $2`,
      [highlightId, userId, storyId]
    );

    if (inserted.rows[0]) {
      return inserted.rows[0];
    }

    return {
      highlightId,
      storyId,
      alreadyAdded: true,
    };
  });
}

async function removeStoryFromHighlight(userId, highlightId, storyId) {
  return withTransaction(async (client) => {
    const highlight = await client.query(
      `SELECT id FROM story_highlights
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [highlightId, userId]
    );

    if (!highlight.rowCount) return false;

    const removed = await client.query(
      `DELETE FROM story_highlight_items hi
       USING story_highlights h
       WHERE hi.highlight_id = h.id
         AND h.id = $1
         AND h.user_id = $2
         AND hi.story_id = $3
       RETURNING hi.story_id`,
      [highlightId, userId, storyId]
    );

    if (!removed.rowCount) {
      return false;
    }

    await client.query(
      `UPDATE story_highlights h
       SET cover_story_id = (
         SELECT hi.story_id
         FROM story_highlight_items hi
         JOIN stories s ON s.id = hi.story_id
         WHERE hi.highlight_id = h.id
           AND s.deleted_at IS NULL
           AND s.media_deleted_at IS NULL
         ORDER BY hi.display_order, hi.added_at
         LIMIT 1
       ),
       updated_at = NOW()
       WHERE h.id = $1
         AND h.user_id = $2
         AND h.cover_story_id = $3`,
      [highlightId, userId, storyId]
    );

    return true;
  });
}

async function setHighlightCover(userId, highlightId, storyId) {
  return withTransaction(async (client) => {
    const highlight = await client.query(
      `SELECT id FROM story_highlights
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [highlightId, userId]
    );

    if (!highlight.rowCount) return null;

    const membership = await client.query(
      `SELECT 1
       FROM story_highlight_items hi
       JOIN stories s ON s.id = hi.story_id
       WHERE hi.highlight_id = $1
         AND hi.story_id = $2
         AND s.deleted_at IS NULL
         AND s.media_deleted_at IS NULL
         AND s.user_id = $3`,
      [highlightId, storyId, userId]
    );

    if (!membership.rowCount) return null;

    const result = await client.query(
      `UPDATE story_highlights
       SET cover_story_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, cover_story_id AS "coverStoryId"`,
      [highlightId, userId, storyId]
    );

    return result.rows[0] || null;
  });
}

async function reorderHighlightStories(userId, highlightId, storyIds) {
  return withTransaction(async (client) => {
    const highlight = await client.query(
      `SELECT id FROM story_highlights
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [highlightId, userId]
    );

    if (!highlight.rowCount) return null;

    const validation = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM story_highlight_items
          WHERE highlight_id = $1) AS total,
         (SELECT COUNT(*)::int FROM story_highlight_items
          WHERE highlight_id = $1
            AND story_id = ANY($2::uuid[])) AS matched`,
      [highlightId, storyIds]
    );

    const { total, matched } = validation.rows[0];

    if (total !== storyIds.length || matched !== storyIds.length) {
      return { invalidMembership: true };
    }

    await client.query(
      `UPDATE story_highlight_items hi
       SET display_order = ordered.position - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY
         AS ordered(story_id, position)
       WHERE hi.highlight_id = $1
         AND hi.story_id = ordered.story_id`,
      [highlightId, storyIds]
    );

    await client.query(
      `UPDATE story_highlights
       SET updated_at = NOW()
       WHERE id = $1`,
      [highlightId]
    );

    return { highlightId, storyIds };
  });
}
async function setHighlightCover(userId, highlightId, storyId) {
  return withTransaction(async (client) => {
    const highlight = await client.query(
      `SELECT id FROM story_highlights
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [highlightId, userId]
    );

    if (!highlight.rowCount) return null;

    const membership = await client.query(
      `SELECT 1
       FROM story_highlight_items hi
       JOIN stories s ON s.id = hi.story_id
       WHERE hi.highlight_id = $1
         AND hi.story_id = $2
         AND s.deleted_at IS NULL
         AND s.media_deleted_at IS NULL`,
      [highlightId, storyId]
    );

    if (!membership.rowCount) return null;

    const result = await client.query(
      `UPDATE story_highlights
       SET cover_story_id = $3, updated_at = NOW()
       WHERE id = $1 AND user_id = $2
       RETURNING id, cover_story_id AS "coverStoryId"`,
      [highlightId, userId, storyId]
    );

    return result.rows[0] || null;
  });
}

async function reorderHighlightStories(userId, highlightId, storyIds) {
  return withTransaction(async (client) => {
    const highlight = await client.query(
      `SELECT id FROM story_highlights
       WHERE id = $1 AND user_id = $2
       FOR UPDATE`,
      [highlightId, userId]
    );

    if (!highlight.rowCount) return null;

    const membership = await client.query(
      `SELECT COUNT(*)::int AS count
       FROM story_highlight_items
       WHERE highlight_id = $1`,
      [highlightId]
    );

    if (membership.rows[0].count !== storyIds.length) {
      return { invalidMembership: true };
    }

    const updated = await client.query(
      `UPDATE story_highlight_items hi
       SET display_order = ordered.position - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY
         AS ordered(story_id, position)
       WHERE hi.highlight_id = $1
         AND hi.story_id = ordered.story_id
       RETURNING hi.story_id`,
      [highlightId, storyIds]
    );

    if (updated.rowCount !== storyIds.length) {
      return { invalidMembership: true };
    }

    await client.query(
      `UPDATE story_highlights
       SET updated_at = NOW()
       WHERE id = $1`,
      [highlightId]
    );

    return { highlightId, storyIds };
  });
}
async function deleteHighlight(userId, highlightId) {
  const result = await query(
    `DELETE FROM story_highlights
     WHERE id = $1
       AND user_id = $2
     RETURNING id`,
    [highlightId, userId]
  );

  return result.rowCount > 0;
}

async function updateHighlightTitle(userId, highlightId, title) {
  const result = await query(
    `UPDATE story_highlights
     SET title = $3,
         updated_at = NOW()
     WHERE id = $1
       AND user_id = $2
     RETURNING
       id,
       user_id AS "userId",
       title,
       display_order AS "displayOrder",
       updated_at AS "updatedAt"`,
    [highlightId, userId, title]
  );

  return result.rows[0] || null;
}


async function getHighlightedStoryForViewer(highlightId, storyId, viewerId) {
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
     WHERE s.id = $3
       AND EXISTS (
         SELECT 1
         FROM story_highlight_items shi
         JOIN story_highlights h ON h.id = shi.highlight_id
         WHERE shi.story_id = s.id
           AND shi.highlight_id = $2
           AND h.user_id = s.user_id
       )
       AND ${HIGHLIGHT_STORY_ACCESS_SQL}
     LIMIT 1`,
    [viewerId, highlightId, storyId]
  );

  return result.rows[0] || null;
}
module.exports = {
  createHighlight,
  listHighlightsForViewer,
  getHighlightForViewer,
  getHighlightedStoryForViewer,
  addStoryToHighlight,
  removeStoryFromHighlight,
  setHighlightCover,
  reorderHighlightStories,
  deleteHighlight,
  updateHighlightTitle,
};



