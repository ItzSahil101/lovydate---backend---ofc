require('dotenv').config();
const { pool } = require('./pool');

async function cleanDatabase() {
  console.log('--- Cleaning LovyDate PostgreSQL Database ---');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('Truncating tables...');
    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
          TRUNCATE TABLE 
            users,
            profiles,
            user_preferences,
            user_locations,
            user_interests,
            profile_photos,
            likes,
            passes,
            matches,
            conversations,
            conversation_members,
            messages,
            blocks,
            reports,
            refresh_tokens,
            onboarding_progress
          CASCADE;
        END IF;

        IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'posts') THEN
          TRUNCATE TABLE 
            posts,
            post_photos,
            post_likes,
            post_comments
          CASCADE;
        END IF;
      END $$;
    `);

    // Ensure interests reference table is populated
    await client.query(`
      INSERT INTO interests (name, category, icon_name) VALUES
        ('Coffee', 'Lifestyle', 'coffee_outlined'),
        ('Music', 'Creative', 'music_note_outlined'),
        ('Travel', 'Outdoors', 'flight_outlined'),
        ('Hiking', 'Outdoors', 'terrain_outlined'),
        ('Gaming', 'Lifestyle', 'sports_esports_outlined'),
        ('Dogs', 'Lifestyle', 'pets_outlined'),
        ('Photography', 'Creative', 'camera_alt_outlined'),
        ('Movies', 'Creative', 'movie_outlined'),
        ('Cooking', 'Creative', 'restaurant_outlined'),
        ('Reading', 'Creative', 'menu_book_outlined'),
        ('Fitness', 'Outdoors', 'fitness_center_outlined'),
        ('Football', 'Outdoors', 'sports_soccer_outlined'),
        ('Cricket', 'Outdoors', 'sports_cricket_outlined'),
        ('Technology', 'Lifestyle', 'memory_outlined'),
        ('Coding', 'Lifestyle', 'code_outlined'),
        ('Nature', 'Outdoors', 'park_outlined'),
        ('Running', 'Outdoors', 'directions_run_outlined'),
        ('Cycling', 'Outdoors', 'directions_bike_outlined'),
        ('Concerts', 'Creative', 'confirmation_number_outlined'),
        ('Dancing', 'Creative', 'nightlife_outlined'),
        ('Cats', 'Lifestyle', 'cruelty_free_outlined')
      ON CONFLICT (name) DO NOTHING;
    `);

    await client.query('COMMIT');
    console.log(' Database cleaned successfully! All user/test data removed while preserving schemas & interests.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(' Error cleaning database:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanDatabase();
