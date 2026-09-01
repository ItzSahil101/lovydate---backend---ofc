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

async function deleteBlock(blockerId, blockedId) {
  await query(
    `DELETE FROM blocks
     WHERE blocker_user_id = $1 AND blocked_user_id = $2`,
    [blockerId, blockedId]
  );
  return { unblocked: true };
}

module.exports = {
  insertBlock,
  deleteBlock,
};
