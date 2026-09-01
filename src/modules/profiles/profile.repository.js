const { query, withTransaction } = require('../../infrastructure/database/pool');

function calculateCompletion(profile) {
  let score = 0;
  if (profile.displayName) score += 15;
  if (profile.dateOfBirth) score += 15;
  if (profile.gender) score += 10;
  if (profile.city || profile.countryCode) score += 10;
  if (Array.isArray(profile.photos)) {
    if (profile.photos.length >= 2) score += 20;
    else if (profile.photos.length === 1) score += 10;
  }
  if (Array.isArray(profile.interests) && profile.interests.length >= 3) {
    score += 10;
  }
  if (profile.bio && profile.bio.trim().length > 0) {
    score += 10;
  }
  if (profile.heightCm || profile.smoking || profile.drinking || profile.occupation || profile.pets) {
    score += 10;
  }
  // When main visible sections are filled, ensure it reaches 100%
  if (score >= 80 && Array.isArray(profile.photos) && profile.photos.length >= 2 && profile.bio && Array.isArray(profile.interests) && profile.interests.length >= 3) {
    score = 100;
  }
  return Math.min(100, Math.round(score));
}

async function getProfileByUserId(userId) {
  const profileRes = await query(
    `SELECT
       p.user_id AS "userId",
       p.display_name AS "displayName",
       p.date_of_birth AS "dateOfBirth",
       EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
       p.gender,
       p.custom_gender AS "customGender",
       p.relationship_goal AS "relationshipGoal",
       p.bio,
       p.occupation,
       p.height_cm AS "heightCm",
       p.smoking,
       p.drinking,
       p.pets,
       (u.email_verified_at IS NOT NULL) AS "isVerified",
       p.onboarding_completed AS "onboardingCompleted",
       p.last_active_at AS "lastActiveAt",
       ul.city,
       ul.country_code AS "countryCode"
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN user_locations ul ON ul.user_id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );

  if (profileRes.rows.length === 0) return null;
  const profile = profileRes.rows[0];

  const photosRes = await query(
    `SELECT id, url, display_order AS "displayOrder", is_primary AS "isPrimary"
     FROM profile_photos
     WHERE user_id = $1
     ORDER BY display_order ASC`,
    [userId]
  );

  const interestsRes = await query(
    `SELECT i.id, i.name, i.category, i.icon_name AS "iconName"
     FROM user_interests ui
     JOIN interests i ON i.id = ui.interest_id
     WHERE ui.user_id = $1
     ORDER BY i.category, i.name`,
    [userId]
  );

  const likesRes = await query(
    `SELECT COUNT(*)::int AS count FROM likes WHERE target_user_id = $1`,
    [userId]
  );

  const matchesRes = await query(
    `SELECT COUNT(*)::int AS count FROM matches WHERE user_one_id = $1 OR user_two_id = $1`,
    [userId]
  );

  const convsRes = await query(
    `SELECT COUNT(*)::int AS count
     FROM conversation_members
     WHERE user_id = $1`,
    [userId]
  );

  const postsRes = await query(
    `SELECT
       p.id,
       p.content,
       p.location_name AS "locationName",
       p.created_at AS "createdAt",
       (SELECT COUNT(*)::int FROM post_likes WHERE post_id = p.id) AS "likesCount",
       (SELECT COUNT(*)::int FROM post_comments WHERE post_id = p.id) AS "commentsCount"
     FROM posts p
     WHERE p.user_id = $1
     ORDER BY p.created_at DESC`,
    [userId]
  );
  const userPosts = postsRes.rows;
  if (userPosts.length > 0) {
    const postIds = userPosts.map((p) => p.id);
    const postPhotosRes = await query(
      `SELECT post_id AS "postId", url FROM post_photos WHERE post_id = ANY($1::uuid[]) ORDER BY display_order ASC`,
      [postIds]
    );
    const photoMap = {};
    postPhotosRes.rows.forEach((ph) => {
      if (!photoMap[ph.postId]) photoMap[ph.postId] = [];
      photoMap[ph.postId].push(ph.url);
    });
    userPosts.forEach((p) => {
      p.photos = photoMap[p.id] || [];
    });
  }

  profile.photos = photosRes.rows;
  profile.interests = interestsRes.rows;
  profile.posts = userPosts;
  profile.likesCount = likesRes.rows[0]?.count || 0;
  profile.matchesCount = matchesRes.rows[0]?.count || 0;
  profile.conversationsCount = convsRes.rows[0]?.count || 0;
  profile.completionPercentage = calculateCompletion(profile);

  return profile;
}

async function areUsersBlocked(firstUserId, secondUserId) {
  const res = await query(
    `SELECT 1 FROM blocks
     WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
        OR (blocker_user_id = $2 AND blocked_user_id = $1)
     LIMIT 1`,
    [firstUserId, secondUserId]
  );
  return res.rows.length > 0;
}

async function getProfilesBatch(userIds, viewerUserId = null) {
  if (!userIds || userIds.length === 0) return [];

  const profilesRes = await query(
    `SELECT
       p.user_id AS "userId",
       p.display_name AS "displayName",
       EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS age,
       p.gender,
       p.relationship_goal AS "relationshipGoal",
       p.bio,
       ul.city,
       (u.email_verified_at IS NOT NULL) AS "isVerified",
        CASE
          WHEN COALESCE(cand_up.show_distance, TRUE) = FALSE OR COALESCE(cand_up.is_incognito, FALSE) = TRUE THEN NULL
          WHEN viewer.latitude IS NOT NULL AND viewer.longitude IS NOT NULL
               AND ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL
          THEN ROUND(
            6371 * ACOS(
              LEAST(1.0, GREATEST(-1.0,
                COS(RADIANS(viewer.latitude)) * COS(RADIANS(ul.latitude)) *
                COS(RADIANS(ul.longitude) - RADIANS(viewer.longitude)) +
                SIN(RADIANS(viewer.latitude)) * SIN(RADIANS(ul.latitude))
              ))
            )
          )::int
          ELSE NULL
        END AS "distanceKm"
      FROM profiles p
      JOIN users u ON u.id = p.user_id
      LEFT JOIN user_locations ul ON ul.user_id = p.user_id
      LEFT JOIN user_locations viewer ON viewer.user_id = $2
      LEFT JOIN user_preferences cand_up ON cand_up.user_id = p.user_id
      WHERE p.user_id = ANY($1::uuid[]) AND p.onboarding_completed = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM blocks b
          WHERE (b.blocker_user_id = $2 AND b.blocked_user_id = p.user_id)
             OR (b.blocked_user_id = $2 AND b.blocker_user_id = p.user_id)
        )`,
    [userIds, viewerUserId]
  );

  const photosRes = await query(
    `SELECT user_id AS "userId", id, url, display_order AS "displayOrder", is_primary AS "isPrimary"
     FROM profile_photos
     WHERE user_id = ANY($1::uuid[])
     ORDER BY display_order ASC`,
    [userIds]
  );

  const interestsRes = await query(
    `SELECT ui.user_id AS "userId", i.id, i.name, i.category, i.icon_name AS "iconName"
     FROM user_interests ui
     JOIN interests i ON i.id = ui.interest_id
     WHERE ui.user_id = ANY($1::uuid[])
     ORDER BY i.category, i.name`,
    [userIds]
  );

  const photosMap = {};
  const interestsMap = {};

  photosRes.rows.forEach((p) => {
    if (!photosMap[p.userId]) photosMap[p.userId] = [];
    photosMap[p.userId].push({
      id: p.id,
      url: p.url,
      displayOrder: p.displayOrder,
      isPrimary: p.isPrimary,
    });
  });

  interestsRes.rows.forEach((i) => {
    if (!interestsMap[i.userId]) interestsMap[i.userId] = [];
    interestsMap[i.userId].push({
      id: i.id,
      name: i.name,
      category: i.category,
      iconName: i.iconName,
    });
  });

  return profilesRes.rows.map((prof) => ({
    ...prof,
    photos: photosMap[prof.userId] || [],
    interests: interestsMap[prof.userId] || [],
  }));
}

async function updateProfile(userId, patch) {
  await withTransaction(async (client) => {
    const fields = [];
    const values = [userId];
    let idx = 2;
    const profileFields = {
      displayName: 'display_name',
      dateOfBirth: 'date_of_birth',
      bio: 'bio',
      relationshipGoal: 'relationship_goal',
      occupation: 'occupation',
      heightCm: 'height_cm',
      smoking: 'smoking',
      drinking: 'drinking',
      pets: 'pets',
    };

    for (const [patchKey, columnName] of Object.entries(profileFields)) {
      if (patch[patchKey] !== undefined) {
        fields.push(`${columnName} = $${idx++}`);
        values.push(patch[patchKey] || null);
      }
    }

    if (fields.length > 0) {
      fields.push('updated_at = NOW()');
      const sql = `UPDATE profiles SET ${fields.join(', ')} WHERE user_id = $1`;
      await client.query(sql, values);
    }

    if (patch.city !== undefined) {
      await client.query(
        `INSERT INTO user_locations (user_id, city, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (user_id)
         DO UPDATE SET city = EXCLUDED.city, updated_at = NOW()`,
        [userId, patch.city || null]
      );
    }

    if (Array.isArray(patch.photos)) {
      await client.query(`DELETE FROM profile_photos WHERE user_id = $1`, [userId]);
      for (let i = 0; i < patch.photos.length; i++) {
        const item = patch.photos[i];
        const url = typeof item === 'string' ? item : (item && item.url ? item.url : null);
        if (url) {
          await client.query(
            `INSERT INTO profile_photos (user_id, url, display_order, is_primary)
             VALUES ($1, $2, $3, $4)`,
            [userId, url, i, i === 0]
          );
        }
      }
    }

    if (Array.isArray(patch.interests)) {
      await client.query(`DELETE FROM user_interests WHERE user_id = $1`, [userId]);
      const interestNames = patch.interests
        .map((i) => (typeof i === 'string' ? i : (i && i.name ? i.name : null)))
        .filter(Boolean);

      if (interestNames.length > 0) {
        await client.query(
          `INSERT INTO user_interests (user_id, interest_id)
           SELECT $1, id FROM interests WHERE name = ANY($2::text[])
           ON CONFLICT DO NOTHING`,
          [userId, interestNames]
        );
      }
    }
  });

  return getProfileByUserId(userId);
}

async function searchProfiles(searchTerm, limit = 20, viewerUserId = null) {
  const cleanTerm = (searchTerm || '').trim();
  const withSpaces = cleanTerm.replace(/_/g, ' ');
  const sql = `
    SELECT
      p.user_id AS "userId",
      p.display_name AS "displayName",
      EXTRACT(YEAR FROM age(NOW(), p.date_of_birth))::int AS age,
      (
        SELECT url FROM profile_photos
        WHERE user_id = p.user_id
        ORDER BY display_order ASC LIMIT 1
      ) AS "avatarUrl",
      loc.city
    FROM profiles p
    LEFT JOIN user_locations loc ON loc.user_id = p.user_id
    WHERE ($1 = '' 
       OR p.display_name ILIKE $2 
       OR p.display_name ILIKE $3 
       OR REPLACE(p.display_name, ' ', '_') ILIKE $2)
      AND ($5::uuid IS NULL OR NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $5 AND b.blocked_user_id = p.user_id)
           OR (b.blocked_user_id = $5 AND b.blocker_user_id = p.user_id)
      ))
    ORDER BY p.display_name ASC
    LIMIT $4
  `;

  const res = await query(sql, [cleanTerm, `%${cleanTerm}%`, `%${withSpaces}%`, limit, viewerUserId]);
  return res.rows;
}

async function getProfileByName(displayName, viewerUserId = null) {
  const cleanName = (displayName || '').trim();
  const withSpaces = cleanName.replace(/_/g, ' ');
  const withUnderscores = cleanName.replace(/\s+/g, '_');
  const check = await query(
    `SELECT user_id FROM profiles 
     WHERE (LOWER(display_name) = LOWER($1)
        OR LOWER(display_name) = LOWER($2)
        OR LOWER(REPLACE(display_name, ' ', '_')) = LOWER($3))
       AND ($4::uuid IS NULL OR NOT EXISTS (
         SELECT 1 FROM blocks b
         WHERE (b.blocker_user_id = $4 AND b.blocked_user_id = profiles.user_id)
            OR (b.blocked_user_id = $4 AND b.blocker_user_id = profiles.user_id)
       ))
     LIMIT 1`,
    [cleanName, withSpaces, withUnderscores, viewerUserId]
  );
  if (check.rows.length === 0) {
    return null;
  }
  return getProfileByUserId(check.rows[0].user_id);
}

async function getPrivacySettings(userId) {
  const sql = `
    SELECT
      COALESCE(is_incognito, FALSE) AS "isIncognito",
      COALESCE(show_online, TRUE) AS "showOnline",
      COALESCE(show_distance, TRUE) AS "showDistance"
    FROM user_preferences
    WHERE user_id = $1
  `;
  const res = await query(sql, [userId]);
  return res.rows[0] || { isIncognito: false, showOnline: true, showDistance: true };
}

async function updatePrivacySettings(userId, { isIncognito, showOnline, showDistance }) {
  const current = await getPrivacySettings(userId);
  const nextIncognito = isIncognito !== undefined ? Boolean(isIncognito) : current.isIncognito;
  const nextShowOnline = showOnline !== undefined ? Boolean(showOnline) : current.showOnline;
  const nextShowDistance = showDistance !== undefined ? Boolean(showDistance) : current.showDistance;

  const sql = `
    INSERT INTO user_preferences (user_id, is_incognito, show_online, show_distance, updated_at)
    VALUES ($1, $2, $3, $4, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      is_incognito = EXCLUDED.is_incognito,
      show_online = EXCLUDED.show_online,
      show_distance = EXCLUDED.show_distance,
      updated_at = NOW()
    RETURNING
      is_incognito AS "isIncognito",
      show_online AS "showOnline",
      show_distance AS "showDistance"
  `;
  const res = await query(sql, [userId, nextIncognito, nextShowOnline, nextShowDistance]);
  return res.rows[0];
}

module.exports = {
  getProfileByUserId,
  getProfilesBatch,
  updateProfile,
  searchProfiles,
  getProfileByName,
  areUsersBlocked,
  getPrivacySettings,
  updatePrivacySettings,
};
