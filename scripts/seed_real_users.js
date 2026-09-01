const { pool, withTransaction } = require('../src/infrastructure/database/pool');
const bcrypt = require('bcryptjs');

const usersToSeed = [
  // 3 FEMALE PROFILES
  {
    email: 'aarohi.sharma@lovydate.com',
    displayName: 'Aarohi Sharma',
    dateOfBirth: '2004-04-15', // 22 years
    gender: 'Woman',
    relationshipGoal: 'Long-term partner',
    bio: 'Architectural design student & part-time barista. Coffee addict, indie acoustics, and chasing sunset views from rooftop cafes. Tell me your favorite book!',
    occupation: 'Architect & Designer',
    heightCm: 165,
    smoking: 'Non-smoker',
    drinking: 'Socially',
    pets: 'Cat lover',
    city: 'Lalitpur',
    countryCode: 'NP',
    latitude: 27.6710,
    longitude: 85.3210,
    interestedIn: ['Man', 'Men'],
    interests: ['Coffee', 'Design', 'Music', 'Reading', 'Photography'],
    photos: [
      'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&q=80',
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80',
      'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&q=80',
    ],
    feedPost: {
      content: 'Golden hour architectural sketches with iced latte in hand ☕🏛️ Loving the weather today!',
      locationName: 'Patan Durbar Square, Lalitpur',
      photos: ['https://images.unsplash.com/photo-1517841905240-472988babdf9?w=800&q=80'],
    },
  },
  {
    email: 'priya.adhikari@lovydate.com',
    displayName: 'Priya Adhikari',
    dateOfBirth: '2002-09-20', // 24 years
    gender: 'Woman',
    relationshipGoal: 'Long-term partner',
    bio: 'Software engineer by day, amateur pastry baker & salsa enthusiast by night. Always down for weekend treks and spontaneous road trips.',
    occupation: 'Software Engineer',
    heightCm: 168,
    smoking: 'Non-smoker',
    drinking: 'Socially',
    pets: 'Dog lover',
    city: 'Kathmandu',
    countryCode: 'NP',
    latitude: 27.7172,
    longitude: 85.3240,
    interestedIn: ['Man', 'Men'],
    interests: ['Technology', 'Hiking', 'Cooking', 'Dancing', 'Travel'],
    photos: [
      'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&q=80',
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80',
      'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&q=80',
    ],
    feedPost: {
      content: 'Morning hike through Shivapuri trail was absolutely refreshing 🌲🏔️',
      locationName: 'Shivapuri National Park, Kathmandu',
      photos: ['https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&q=80'],
    },
  },
  {
    email: 'shristi.thapa@lovydate.com',
    displayName: 'Shristi Thapa',
    dateOfBirth: '2003-01-10', // 23 years
    gender: 'Woman',
    relationshipGoal: 'Long-term partner',
    bio: 'Yoga trainer & nature lover. Exploring quiet trails, meditating by the lakeside, and film photography. Looking for good energy and genuine connection.',
    occupation: 'Yoga Instructor & Wellness Coach',
    heightCm: 162,
    smoking: 'Non-smoker',
    drinking: 'Never',
    pets: 'Dog lover',
    city: 'Kathmandu',
    countryCode: 'NP',
    latitude: 27.7100,
    longitude: 85.3150,
    interestedIn: ['Man', 'Men'],
    interests: ['Yoga', 'Nature', 'Fitness', 'Photography', 'Travel'],
    photos: [
      'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80',
      'https://images.unsplash.com/photo-1519699047748-de8e457a634e?w=800&q=80',
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
    ],
    feedPost: {
      content: 'Sunrise yoga session at the hill. Grateful for peace and fresh mountain breeze 🧘‍♀️✨',
      locationName: 'Nagarkot, Nepal',
      photos: ['https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=800&q=80'],
    },
  },

  // 3 MALE PROFILES
  {
    email: 'rohan.shrestha@lovydate.com',
    displayName: 'Rohan Shrestha',
    dateOfBirth: '2002-06-18', // 24 years
    gender: 'Man',
    relationshipGoal: 'Long-term partner',
    bio: 'UI/UX product designer, vinyl records collector & weekend mountain biker. Let’s grab specialty pour-overs and talk typography or sci-fi.',
    occupation: 'Product Designer',
    heightCm: 178,
    smoking: 'Non-smoker',
    drinking: 'Socially',
    pets: 'Dog lover',
    city: 'Kathmandu',
    countryCode: 'NP',
    latitude: 27.7150,
    longitude: 85.3200,
    interestedIn: ['Woman', 'Women'],
    interests: ['Design', 'Coffee', 'Cycling', 'Music', 'Technology'],
    photos: [
      'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80',
      'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=800&q=80',
      'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&q=80',
    ],
    feedPost: {
      content: 'New acoustic setup in the studio! Who wants to jam this weekend? 🎸',
      locationName: 'Jhamsikhel, Lalitpur',
      photos: ['https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=800&q=80'],
    },
  },
  {
    email: 'ayush.gurung@lovydate.com',
    displayName: 'Ayush Gurung',
    dateOfBirth: '2001-11-05', // 25 years
    gender: 'Man',
    relationshipGoal: 'Long-term partner',
    bio: 'Wilderness trekking guide and photographer. High altitudes, campfires, and capturing starry night skies. Looking for someone to share wild adventures with.',
    occupation: 'Adventure Expedition Guide',
    heightCm: 182,
    smoking: 'Non-smoker',
    drinking: 'Socially',
    pets: 'Dog lover',
    city: 'Pokhara',
    countryCode: 'NP',
    latitude: 28.2096,
    longitude: 83.9856,
    interestedIn: ['Woman', 'Women'],
    interests: ['Hiking', 'Nature', 'Photography', 'Travel', 'Fitness'],
    photos: [
      'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&q=80',
      'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?w=800&q=80',
      'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=800&q=80',
    ],
    feedPost: {
      content: 'Camping under the Milky Way at Mardi Himal high camp 🌌⛺',
      locationName: 'Mardi Himal, Annapurna',
      photos: ['https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=800&q=80'],
    },
  },
  {
    email: 'bikash.karki@lovydate.com',
    displayName: 'Bikash Karki',
    dateOfBirth: '2000-08-25', // 26 years
    gender: 'Man',
    relationshipGoal: 'Long-term partner',
    bio: 'Specialty cafe owner & foodie. Passionate about guitar riffs, football matches, and experimenting with artisan pastas on Sundays.',
    occupation: 'Restaurateur & Chef',
    heightCm: 175,
    smoking: 'Non-smoker',
    drinking: 'Socially',
    pets: 'Dog lover',
    city: 'Lalitpur',
    countryCode: 'NP',
    latitude: 27.6750,
    longitude: 85.3180,
    interestedIn: ['Woman', 'Women'],
    interests: ['Cooking', 'Coffee', 'Football', 'Music', 'Foodie'],
    photos: [
      'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=80',
      'https://images.unsplash.com/photo-1492446845049-9c50ce313d00?w=800&q=80',
      'https://images.unsplash.com/photo-1480429370139-e0132c086e2a?w=800&q=80',
    ],
    feedPost: {
      content: 'Testing our new artisanal sourdough brunch menu! Smells incredible 🥖🍳',
      locationName: 'Sanepa, Lalitpur',
      photos: ['https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?w=800&q=80'],
    },
  },
];

async function seed() {
  console.log('Seeding 6 realistic test accounts (3 female, 3 male)...');
  const passwordHash = await bcrypt.hash('Password123!', 10);

  for (const u of usersToSeed) {
    await withTransaction(async (client) => {
      // 1. Create or get user
      let userRes = await client.query(`SELECT id FROM users WHERE email = $1`, [u.email]);
      let userId;
      if (userRes.rows.length === 0) {
        userRes = await client.query(
          `INSERT INTO users (email, password_hash, email_verified_at, status, created_at, updated_at)
           VALUES ($1, $2, NOW(), 'active', NOW(), NOW())
           RETURNING id`,
          [u.email, passwordHash]
        );
        userId = userRes.rows[0].id;
      } else {
        userId = userRes.rows[0].id;
      }

      // 2. Upsert profile
      await client.query(
        `INSERT INTO profiles (
           user_id, display_name, date_of_birth, gender, relationship_goal, bio,
           occupation, height_cm, smoking, drinking, pets,
           onboarding_completed, last_active_at, updated_at
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           date_of_birth = EXCLUDED.date_of_birth,
           gender = EXCLUDED.gender,
           relationship_goal = EXCLUDED.relationship_goal,
           bio = EXCLUDED.bio,
           occupation = EXCLUDED.occupation,
           height_cm = EXCLUDED.height_cm,
           smoking = EXCLUDED.smoking,
           drinking = EXCLUDED.drinking,
           pets = EXCLUDED.pets,
           onboarding_completed = TRUE,
           last_active_at = NOW(),
           updated_at = NOW()`,
        [
          userId,
          u.displayName,
          u.dateOfBirth,
          u.gender,
          u.relationshipGoal,
          u.bio,
          u.occupation,
          u.heightCm,
          u.smoking,
          u.drinking,
          u.pets,
        ]
      );

      // 3. Upsert user location
      await client.query(
        `INSERT INTO user_locations (user_id, latitude, longitude, city, country_code, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           city = EXCLUDED.city,
           country_code = EXCLUDED.country_code,
           updated_at = NOW()`,
        [userId, u.latitude, u.longitude, u.city, u.countryCode]
      );

      // 4. Upsert user preferences
      await client.query(
        `INSERT INTO user_preferences (user_id, interested_in, min_age, max_age, max_distance_meters, allow_outside_preferences, updated_at)
         VALUES ($1, $2, 18, 45, 100000, TRUE, NOW())
         ON CONFLICT (user_id) DO UPDATE SET
           interested_in = EXCLUDED.interested_in,
           min_age = EXCLUDED.min_age,
           max_age = EXCLUDED.max_age,
           max_distance_meters = EXCLUDED.max_distance_meters,
           allow_outside_preferences = TRUE,
           updated_at = NOW()`,
        [userId, u.interestedIn]
      );

      // 5. Upsert profile photos
      await client.query(`DELETE FROM profile_photos WHERE user_id = $1`, [userId]);
      for (let i = 0; i < u.photos.length; i++) {
        await client.query(
          `INSERT INTO profile_photos (user_id, url, display_order, is_primary, created_at)
           VALUES ($1, $2, $3, $4, NOW())`,
          [userId, u.photos[i], i, i === 0]
        );
      }

      // 6. Upsert interests
      await client.query(`DELETE FROM user_interests WHERE user_id = $1`, [userId]);
      for (const interestName of u.interests) {
        let intRes = await client.query(`SELECT id FROM interests WHERE name = $1`, [interestName]);
        let intId;
        if (intRes.rows.length === 0) {
          intRes = await client.query(
            `INSERT INTO interests (name, category) VALUES ($1, 'General') RETURNING id`,
            [interestName]
          );
          intId = intRes.rows[0].id;
        } else {
          intId = intRes.rows[0].id;
        }
        await client.query(
          `INSERT INTO user_interests (user_id, interest_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [userId, intId]
        );
      }

      // 7. Insert feed post
      if (u.feedPost) {
        const postRes = await client.query(
          `INSERT INTO posts (user_id, content, location_name, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           RETURNING id`,
          [userId, u.feedPost.content, u.feedPost.locationName]
        );
        const postId = postRes.rows[0].id;
        for (let i = 0; i < u.feedPost.photos.length; i++) {
          await client.query(
            `INSERT INTO post_photos (post_id, url, display_order, created_at)
             VALUES ($1, $2, $3, NOW())`,
            [postId, u.feedPost.photos[i], i]
          );
        }
      }

      console.log(`✓ Seeded ${u.displayName} (${u.gender}, ${u.city})`);
    });
  }

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  seed()
    .then(() => pool.end())
    .catch((err) => {
      console.error('Seed error:', err);
      pool.end();
      process.exit(1);
    });
}

module.exports = { seed };
