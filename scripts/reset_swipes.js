const { pool } = require('../src/infrastructure/database/pool');
const redis = require('../src/infrastructure/redis/client');

async function resetSwipes() {
  const u = await pool.query("SELECT id FROM users WHERE email = 'sameer.lamichhane@lovydate.fun' OR email NOT LIKE '%@lovydate.com' LIMIT 1");
  if (u.rows.length === 0) return;
  const currentUserId = u.rows[0].id;
  await pool.query('DELETE FROM likes WHERE source_user_id = $1', [currentUserId]);
  await pool.query('DELETE FROM passes WHERE source_user_id = $1', [currentUserId]);
  await pool.query('DELETE FROM matches WHERE user_one_id = $1 OR user_two_id = $1', [currentUserId]);
  await redis.del(`discovery:candidates:${currentUserId}`);
  console.log('✅ Successfully reset test swipes and cache for user:', currentUserId);
}

resetSwipes().finally(() => {
  pool.end();
  redis.quit();
});
