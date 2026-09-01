const { pool, query } = require('./infrastructure/database/pool');

async function cleanMockFeed() {
  await query(`DELETE FROM post_photos`);
  await query(`DELETE FROM post_likes`);
  await query(`DELETE FROM post_comments`);
  await query(`DELETE FROM posts`);
  console.log('CLEANED_MOCK_POSTS_SUCCESSFULLY');
  await pool.end();
}

cleanMockFeed().catch(console.error);
