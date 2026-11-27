const { query } = require('../../infrastructure/database/pool');

async function setStoryReaction(storyId, userId, reaction) {
  const result = await query(
    `INSERT INTO story_reactions (story_id, user_id, reaction)
     SELECT s.id, $2, $3
     FROM stories s
     WHERE s.id = $1
       AND s.deleted_at IS NULL
       AND s.expires_at > NOW()
       AND (
         s.user_id = $2
         OR (
           s.moderation_status = 'approved'
           AND NOT EXISTS (
             SELECT 1 FROM blocks b
             WHERE (b.blocker_user_id = $2 AND b.blocked_user_id = s.user_id)
                OR (b.blocker_user_id = s.user_id AND b.blocked_user_id = $2)
           )
           AND (
             s.visibility = 'everyone'
             OR (
               s.visibility = 'matches'
               AND EXISTS (
                 SELECT 1 FROM matches m
                 WHERE (
                   (m.user_one_id = $2 AND m.user_two_id = s.user_id)
                   OR (m.user_two_id = $2 AND m.user_one_id = s.user_id)
                 )
                 AND m.unmatched_at IS NULL
               )
             )
             OR (
               s.visibility = 'selected'
               AND EXISTS (
                 SELECT 1 FROM story_allowed_viewers sav
                 WHERE sav.story_id = s.id
                   AND sav.viewer_user_id = $2
               )
             )
           )
         )
       )
     ON CONFLICT (story_id, user_id)
     DO UPDATE SET
       reaction = EXCLUDED.reaction,
       created_at = NOW()
     RETURNING id, story_id AS "storyId",
               user_id AS "userId", reaction,
               created_at AS "createdAt", (xmax = 0) AS "isNew"`,
    [storyId, userId, reaction]
  );

  return result.rows[0] || null;
}

async function removeStoryReaction(storyId, userId) {
  const result = await query(
    `DELETE FROM story_reactions sr
     USING stories s
     WHERE sr.story_id = s.id
       AND sr.story_id = $1
       AND sr.user_id = $2
       AND s.deleted_at IS NULL
       AND s.expires_at > NOW()
     RETURNING sr.story_id AS "storyId", sr.user_id AS "userId"`,
    [storyId, userId]
  );

  return result.rows[0] || null;
}

module.exports = {
  setStoryReaction,
  removeStoryReaction,
};

