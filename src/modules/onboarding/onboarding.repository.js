const { query, withTransaction } = require('../../infrastructure/database/pool');

async function getProgress(userId) {
  const res = await query(
    `SELECT
       $1::uuid AS user_id,
       COALESCE(p.onboarding_completed, FALSE) AS "onboardingCompleted",
       COALESCE(op.step, 1) AS step,
       COALESCE(op.draft_data, '{}'::jsonb) AS draft_data
     FROM users u
     LEFT JOIN profiles p ON p.user_id = u.id
     LEFT JOIN onboarding_progress op ON op.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function updateProgress(userId, step, patchData) {
  const res = await query(
    `INSERT INTO onboarding_progress (user_id, step, draft_data, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       step = GREATEST(onboarding_progress.step, EXCLUDED.step),
       draft_data = onboarding_progress.draft_data || EXCLUDED.draft_data,
       updated_at = NOW()
     RETURNING user_id, step, draft_data`,
    [userId, step, JSON.stringify(patchData)]
  );
  return res.rows[0];
}

async function updateUserLocation(userId, { latitude, longitude, city = null, countryCode = null }) {
  await query(
    `INSERT INTO user_locations (user_id, latitude, longitude, city, country_code, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       latitude = EXCLUDED.latitude,
       longitude = EXCLUDED.longitude,
       city = COALESCE(EXCLUDED.city, user_locations.city),
       country_code = COALESCE(EXCLUDED.country_code, user_locations.country_code),
       updated_at = NOW()`,
    [userId, latitude, longitude, city, countryCode]
  );
  return { updated: true, latitude, longitude, city };
}

async function completeOnboarding(userId, data) {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO profiles (
         user_id, display_name, date_of_birth, gender, custom_gender,
         relationship_goal, bio, occupation, height_cm, smoking, drinking, pets,
         onboarding_completed, last_active_at, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, TRUE, NOW(), NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         display_name = EXCLUDED.display_name,
         date_of_birth = EXCLUDED.date_of_birth,
         gender = EXCLUDED.gender,
         custom_gender = EXCLUDED.custom_gender,
         relationship_goal = EXCLUDED.relationship_goal,
         bio = EXCLUDED.bio,
         occupation = COALESCE(EXCLUDED.occupation, profiles.occupation),
         height_cm = COALESCE(EXCLUDED.height_cm, profiles.height_cm),
         smoking = COALESCE(EXCLUDED.smoking, profiles.smoking),
         drinking = COALESCE(EXCLUDED.drinking, profiles.drinking),
         pets = COALESCE(EXCLUDED.pets, profiles.pets),
         onboarding_completed = TRUE,
         last_active_at = NOW(),
         updated_at = NOW()`,
      [
        userId,
        data.basicInfo.displayName,
        data.basicInfo.dateOfBirth,
        data.basicInfo.gender,
        data.basicInfo.customGender || null,
        data.preferences.relationshipGoal,
        data.about?.bio || null,
        data.about?.occupation || null,
        data.about?.heightCm || null,
        data.about?.smoking || null,
        data.about?.drinking || null,
        data.about?.pets || null,
      ]
    );

    await client.query(
      `INSERT INTO user_preferences (user_id, interested_in, min_age, max_age, max_distance_meters, allow_outside_preferences, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (user_id)
       DO UPDATE SET
         interested_in = EXCLUDED.interested_in,
         min_age = EXCLUDED.min_age,
         max_age = EXCLUDED.max_age,
         max_distance_meters = EXCLUDED.max_distance_meters,
         allow_outside_preferences = EXCLUDED.allow_outside_preferences,
         updated_at = NOW()`,
      [
        userId,
        data.preferences.interestedIn,
        data.discovery?.minAge || 18,
        data.discovery?.maxAge || 60,
        data.discovery?.maxDistanceMeters || 50000,
        data.discovery?.allowOutsidePreferences ?? true,
      ]
    );

    if (data.location && data.location.latitude != null && data.location.longitude != null) {
      await client.query(
        `INSERT INTO user_locations (user_id, latitude, longitude, city, country_code, updated_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           city = COALESCE(EXCLUDED.city, user_locations.city),
           country_code = COALESCE(EXCLUDED.country_code, user_locations.country_code),
           updated_at = NOW()`,
        [
          userId,
          data.location.latitude,
          data.location.longitude,
          data.location.city || null,
          data.location.countryCode || null,
        ]
      );
    }

    await client.query('DELETE FROM profile_photos WHERE user_id = $1', [userId]);
    for (let i = 0; i < data.photos.length; i++) {
      const photoUrl = data.photos[i];
      await client.query(
        `INSERT INTO profile_photos (user_id, url, display_order, is_primary)
         VALUES ($1, $2, $3, $4)`,
        [userId, photoUrl, i, i === 0]
      );
    }

    await client.query('DELETE FROM user_interests WHERE user_id = $1', [userId]);
    for (const interestName of data.interests) {
      await client.query(
        `INSERT INTO user_interests (user_id, interest_id)
         SELECT $1, id FROM interests WHERE name = $2
         ON CONFLICT DO NOTHING`,
        [userId, interestName]
      );
    }

    await client.query(
      `UPDATE onboarding_progress
       SET step = 6, updated_at = NOW()
       WHERE user_id = $1`,
      [userId]
    );

    return { completed: true };
  });
}

module.exports = {
  getProgress,
  updateProgress,
  updateUserLocation,
  completeOnboarding,
};
