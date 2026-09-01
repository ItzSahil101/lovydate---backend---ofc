const { pool, query } = require('./pool');

async function seedFeed() {
  const usersRes = await query(`SELECT user_id, display_name FROM profiles LIMIT 10`);
  if (usersRes.rows.length === 0) return;

  const usersMap = {};
  usersRes.rows.forEach((u) => {
    usersMap[u.display_name] = u.user_id;
  });

  const sameerId = usersMap['Sameer'] || usersRes.rows[0].user_id;
  const ananyaId = usersMap['Ananya'] || usersRes.rows[1]?.user_id || sameerId;
  const riyaId = usersMap['Riya'] || usersRes.rows[2]?.user_id || sameerId;

  await query(`DELETE FROM post_photos`);
  await query(`DELETE FROM post_likes`);
  await query(`DELETE FROM post_comments`);
  await query(`DELETE FROM posts`);

  const p1 = await query(
    `INSERT INTO posts (user_id, content, location_name, created_at)
     VALUES ($1, $2, $3, NOW() - INTERVAL '2 hours')
     RETURNING id`,
    [
      sameerId,
      'Sunsets, good music and even better company.\n#WeekendVibes 🌅',
      'Mumbai, India',
    ]
  );
  await query(
    `INSERT INTO post_photos (post_id, url, display_order)
     VALUES ($1, $2, 0)`,
    [
      p1.rows[0].id,
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1200&auto=format&fit=crop&q=80',
    ]
  );

  const p2 = await query(
    `INSERT INTO posts (user_id, content, location_name, created_at)
     VALUES ($1, $2, $3, NOW() - INTERVAL '4 hours')
     RETURNING id`,
    [
      ananyaId,
      'Little joys from today ✨',
      'Pune, India',
    ]
  );
  await query(
    `INSERT INTO post_photos (post_id, url, display_order)
     VALUES
      ($1, 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80', 0),
      ($1, 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=600&auto=format&fit=crop&q=80', 1),
      ($1, 'https://images.unsplash.com/photo-1552053831-71594a27632d?w=600&auto=format&fit=crop&q=80', 2)`,
    [p2.rows[0].id]
  );

  const p3 = await query(
    `INSERT INTO posts (user_id, content, location_name, created_at)
     VALUES ($1, $2, $3, NOW() - INTERVAL '6 hours')
     RETURNING id`,
    [
      riyaId,
      'Hiking heals everything! 🌿⛰️',
      'Bangalore, India',
    ]
  );
  await query(
    `INSERT INTO post_photos (post_id, url, display_order)
     VALUES ($1, $2, 0)`,
    [
      p3.rows[0].id,
      'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=1200&auto=format&fit=crop&q=80',
    ]
  );

  console.log('Feed seeded successfully!');
  await pool.end();
}

if (require.main === module) {
  seedFeed();
}

module.exports = { seedFeed };
