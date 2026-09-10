const { query } = require('../../infrastructure/database/pool');

async function getUserPreferencesAndLocation(userId) {
  const res = await query(
    `SELECT
       COALESCE(up.interested_in, ARRAY['Everyone']::text[]) AS "interestedIn",
       COALESCE(up.min_age, 18) AS "minAge",
       COALESCE(up.max_age, 60) AS "maxAge",
       COALESCE(up.max_distance_meters, 50000) AS "maxDistanceMeters",
       COALESCE(up.allow_outside_preferences, TRUE) AS "allowOutsidePreferences",
       p.gender AS "userGender",
       EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "userAge",
       ul.latitude,
       ul.longitude
     FROM profiles p
     LEFT JOIN user_preferences up ON up.user_id = p.user_id
     LEFT JOIN user_locations ul ON ul.user_id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function findCandidateUserIds(userId, prefs, limit = 100) {
  const values = [userId];
  let idx = 2;

  let genderClause = '';
  if (prefs.interestedIn && prefs.interestedIn.length > 0 && !prefs.interestedIn.includes('Everyone')) {
    const expandedGenders = [];
    for (const g of prefs.interestedIn) {
      if (g === 'Men' || g === 'Man') {
        expandedGenders.push('Man', 'Men');
      } else if (g === 'Women' || g === 'Woman') {
        expandedGenders.push('Woman', 'Women');
      } else {
        expandedGenders.push(g);
      }
    }
    genderClause = `AND p.gender = ANY($${idx++}::varchar[])`;
    values.push(expandedGenders);
  }

  let ageClause = '';
  if (prefs.minAge && prefs.maxAge && !prefs.allowOutsidePreferences) {
    ageClause = `AND p.date_of_birth <= (CURRENT_DATE - ($${idx++} * INTERVAL '1 year'))
                 AND p.date_of_birth >= (CURRENT_DATE - (($${idx++} + 1) * INTERVAL '1 year'))`;
    values.push(prefs.minAge, prefs.maxAge);
  }

  let goalClause = '';
  if (prefs.relationshipGoal) {
    goalClause = `AND p.relationship_goal = $${idx++}`;
    values.push(prefs.relationshipGoal);
  }

  let geoClause = '';
  if (prefs.latitude != null && prefs.longitude != null && prefs.maxDistanceMeters && !prefs.allowOutsidePreferences) {
    const maxDistKm = prefs.maxDistanceMeters / 1000.0;
    geoClause = `AND ul.latitude IS NOT NULL
                 AND (
                   6371 * acos(LEAST(1.0, GREATEST(-1.0,
                     cos(radians($${idx++})) * cos(radians(ul.latitude)) *
                     cos(radians(ul.longitude) - radians($${idx++})) +
                     sin(radians($${idx++})) * sin(radians(ul.latitude))
                   )))
                 ) <= $${idx++}`;
    values.push(prefs.latitude, prefs.longitude, prefs.latitude, maxDistKm);
  }

  let verifiedClause = '';
  if (prefs.verifiedOnly === true || prefs.verifiedOnly === 'true') {
    verifiedClause = 'AND u.email_verified_at IS NOT NULL';
  }

  let orderClause = 'ORDER BY p.last_active_at DESC';
  if (prefs.latitude != null && prefs.longitude != null) {
    const latIdx1 = idx++;
    const lonIdx = idx++;
    const latIdx2 = idx++;
    values.push(prefs.latitude, prefs.longitude, prefs.latitude);
    orderClause = `ORDER BY
      CASE
        WHEN ul.latitude IS NOT NULL AND ul.longitude IS NOT NULL
        THEN (
          6371 * ACOS(
            LEAST(1.0, GREATEST(-1.0,
              COS(RADIANS($${latIdx1})) * COS(RADIANS(ul.latitude)) *
              COS(RADIANS(ul.longitude) - RADIANS($${lonIdx})) +
              SIN(RADIANS($${latIdx2})) * SIN(RADIANS(ul.latitude))
            ))
          )
        )
        ELSE 999999
      END ASC,
      p.last_active_at DESC`;
  }

  values.push(limit);
  const limitIdx = idx++;

  const sql = `
    SELECT p.user_id AS "userId"
    FROM profiles p
    JOIN users u ON u.id = p.user_id AND u.status = 'active'
    LEFT JOIN user_locations ul ON ul.user_id = p.user_id
    LEFT JOIN user_preferences cand_up ON cand_up.user_id = p.user_id
    WHERE p.user_id != $1
      AND p.onboarding_completed = TRUE
      AND COALESCE(cand_up.is_incognito, FALSE) = FALSE
      ${genderClause}
      ${ageClause}
      ${goalClause}
      ${geoClause}
      ${verifiedClause}
      AND NOT EXISTS (
        SELECT 1 FROM likes l
        WHERE l.source_user_id = $1 AND l.target_user_id = p.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM passes ps
        WHERE ps.source_user_id = $1 AND ps.target_user_id = p.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM matches m
        WHERE (m.user_one_id = $1 AND m.user_two_id = p.user_id)
           OR (m.user_two_id = $1 AND m.user_one_id = p.user_id)
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = p.user_id)
           OR (b.blocker_user_id = p.user_id AND b.blocked_user_id = $1)
      )
    ${orderClause}
    LIMIT $${limitIdx}
  `;

  const res = await query(sql, values);
  return res.rows.map((r) => r.userId);
}

module.exports = {
  getUserPreferencesAndLocation,
  findCandidateUserIds,
};
