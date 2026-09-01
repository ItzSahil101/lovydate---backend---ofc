const { query, withTransaction } = require('../../infrastructure/database/pool');

async function insertBlock(blockerId, blockedId) {
  return withTransaction(async (client) => {
    const firstId = blockerId < blockedId ? blockerId : blockedId;
    const secondId = blockerId < blockedId ? blockedId : blockerId;
    await client.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`${firstId}:${secondId}`]
    );

    const targetRes = await client.query(
      `SELECT 1 FROM users WHERE id = $1 AND status = 'active'`,
      [blockedId]
    );
    if (targetRes.rows.length === 0) return { targetUnavailable: true };

    await client.query(
      `INSERT INTO blocks (blocker_user_id, blocked_user_id)
       VALUES ($1, $2)
       ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`,
      [blockerId, blockedId]
    );

    // Blocking severs the relationship in both directions. The match delete
    // cascades to its conversation and messages.
    await client.query(
      `DELETE FROM likes
       WHERE (source_user_id = $1 AND target_user_id = $2)
          OR (source_user_id = $2 AND target_user_id = $1)`,
      [blockerId, blockedId]
    );
    await client.query(
      `DELETE FROM passes
       WHERE (source_user_id = $1 AND target_user_id = $2)
          OR (source_user_id = $2 AND target_user_id = $1)`,
      [blockerId, blockedId]
    );
    await client.query(
      `DELETE FROM matches
       WHERE (user_one_id = $1 AND user_two_id = $2)
          OR (user_one_id = $2 AND user_two_id = $1)`,
      [blockerId, blockedId]
    );
    await client.query(
      `DELETE FROM notifications
       WHERE (recipient_id = $1 AND sender_id = $2)
          OR (recipient_id = $2 AND sender_id = $1)`,
      [blockerId, blockedId]
    );
    return { blocked: true };
  });
}

async function deleteBlock(blockerId, blockedId) {
  await query(
    `DELETE FROM blocks WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
    [blockerId, blockedId]
  );
  return { unblocked: true };
}

async function getBlockedUsers(userId) {
  const res = await query(
    `SELECT
       b.blocked_user_id AS "userId",
       b.created_at AS "blockedAt",
       prof.display_name AS "displayName",
       (
         SELECT url FROM profile_photos
         WHERE user_id = b.blocked_user_id
         ORDER BY display_order ASC LIMIT 1
       ) AS "avatarUrl"
     FROM blocks b
     JOIN profiles prof ON prof.user_id = b.blocked_user_id
     WHERE b.blocker_user_id = $1
     ORDER BY b.created_at DESC`,
    [userId]
  );
  return res.rows;
}

module.exports = {
  insertBlock,
  deleteBlock,
  getBlockedUsers,
};
