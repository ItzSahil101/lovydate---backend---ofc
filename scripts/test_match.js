const { pool } = require('../src/infrastructure/database/pool');
const { likeUser } = require('../src/modules/likes/likes.service');

async function testMatch() {
  const users = await pool.query('SELECT user_id, display_name FROM profiles LIMIT 2');
  const u1 = users.rows[0];
  const u2 = users.rows[1];
  console.log(`Testing mutual like between: ${u1.display_name} (${u1.user_id}) and ${u2.display_name} (${u2.user_id})`);

  // Clean existing likes and matches
  const match = await pool.query(
    'SELECT id FROM matches WHERE (user_one_id = $1 AND user_two_id = $2) OR (user_one_id = $2 AND user_two_id = $1)',
    [u1.user_id, u2.user_id]
  );
  if (match.rows.length > 0) {
    const matchId = match.rows[0].id;
    await pool.query('DELETE FROM conversation_members WHERE conversation_id IN (SELECT id FROM conversations WHERE match_id = $1)', [matchId]);
    await pool.query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE match_id = $1)', [matchId]);
    await pool.query('DELETE FROM conversations WHERE match_id = $1', [matchId]);
    await pool.query('DELETE FROM matches WHERE id = $1', [matchId]);
  }
  await pool.query(
    'DELETE FROM likes WHERE (source_user_id = $1 AND target_user_id = $2) OR (source_user_id = $2 AND target_user_id = $1)',
    [u1.user_id, u2.user_id]
  );

  console.log('--- Step 1: User 1 likes User 2 ---');
  const res1 = await likeUser(u1.user_id, u2.user_id);
  console.log('Result 1:', res1);

  console.log('--- Step 2: User 2 likes User 1 (Mutual Match) ---');
  const res2 = await likeUser(u2.user_id, u1.user_id);
  console.log('Result 2:', res2);
}

testMatch().finally(() => pool.end());
