const { query } = require('../../infrastructure/database/pool');

async function insertBlock(blockerId, blockedId) {
  await query(
    `INSERT INTO blocks (blocker_user_id, blocked_user_id)
     VALUES ($1, $2)
     ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING`,
    [blockerId, blockedId]
  );
  return { blocked: true };
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
