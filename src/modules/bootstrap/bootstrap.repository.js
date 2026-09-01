const { query } = require('../../infrastructure/database/pool');

async function getBootstrapData(userId) {
  const userRes = await query(
    'SELECT id, email, status, email_verified_at AS "emailVerifiedAt" FROM users WHERE id = $1',
    [userId]
  );
  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0];

  const profileRes = await query(
    `SELECT
       p.display_name AS "displayName",
       p.onboarding_completed AS "onboardingCompleted",
       (
         SELECT url FROM profile_photos
         WHERE user_id = $1 AND is_primary = TRUE
         LIMIT 1
       ) AS "primaryPhotoUrl"
     FROM profiles p
     WHERE p.user_id = $1`,
    [userId]
  );
  const profile = profileRes.rows[0];

  const unreadRes = await query(
    `SELECT COUNT(*)::int AS "unreadMessages"
     FROM conversation_members cm
     JOIN messages m ON m.conversation_id = cm.conversation_id
     WHERE cm.user_id = $1
       AND m.sender_id != $1
       AND (cm.last_read_message_id IS NULL OR m.created_at > (
         SELECT created_at FROM messages WHERE id = cm.last_read_message_id
       ))`,
    [userId]
  );

  const matchesRes = await query(
    `SELECT COUNT(*)::int AS "matchCount"
     FROM matches m
     WHERE (m.user_one_id = $1 OR m.user_two_id = $1)`,
    [userId]
  );

  return {
    user,
    onboardingCompleted: profile ? profile.onboardingCompleted : false,
    profileSummary: profile
      ? {
          displayName: profile.displayName,
          primaryPhotoUrl: profile.primaryPhotoUrl,
        }
      : null,
    unreadMessages: unreadRes.rows[0]?.unreadMessages || 0,
    newMatches: matchesRes.rows[0]?.matchCount || 0,
    interestVersion: '1.0',
  };
}

module.exports = {
  getBootstrapData,
};
