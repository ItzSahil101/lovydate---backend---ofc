const { query } = require('../../infrastructure/database/pool');

async function getMatchesForUser(userId, limit = 20, cursor = null) {
  const values = [userId];
  let cursorClause = '';

  if (cursor && cursor.createdAt && cursor.id) {
    values.push(cursor.createdAt, cursor.id);
    cursorClause = 'AND (m.created_at, m.id) < ($2, $3)';
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  const sql = `
    SELECT
      m.id,
      m.created_at AS "createdAt",
      CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END AS "partnerUserId",
      p.display_name AS "partnerName",
      p.date_of_birth AS "partnerDob",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "partnerAge",
      p.bio AS "partnerBio",
      c.id AS "conversationId",
      (
        SELECT url FROM profile_photos
        WHERE user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
          AND is_primary = TRUE
        LIMIT 1
      ) AS "partnerPhotoUrl"
    FROM matches m
    JOIN profiles p ON p.user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
    LEFT JOIN conversations c ON c.match_id = m.id
    WHERE (m.user_one_id = $1 OR m.user_two_id = $1)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
           OR (b.blocked_user_id = $1 AND b.blocker_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
      )
      ${cursorClause}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT $${limitIdx}
  `;

  const res = await query(sql, values);
  const rows = res.rows;
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  return {
    items,
    hasMore,
  };
}

async function getMatchById(matchId, userId) {
  const sql = `
    SELECT
      m.id,
      m.created_at AS "createdAt",
      CASE WHEN m.user_one_id = $2 THEN m.user_two_id ELSE m.user_one_id END AS "partnerUserId",
      p.display_name AS "partnerName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "partnerAge",
      c.id AS "conversationId"
    FROM matches m
    JOIN profiles p ON p.user_id = CASE WHEN m.user_one_id = $2 THEN m.user_two_id ELSE m.user_one_id END
    LEFT JOIN conversations c ON c.match_id = m.id
    WHERE m.id = $1 AND (m.user_one_id = $2 OR m.user_two_id = $2)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $2 AND b.blocked_user_id = CASE WHEN m.user_one_id = $2 THEN m.user_two_id ELSE m.user_one_id END)
           OR (b.blocked_user_id = $2 AND b.blocker_user_id = CASE WHEN m.user_one_id = $2 THEN m.user_two_id ELSE m.user_one_id END)
      )
  `;
  const res = await query(sql, [matchId, userId]);
  return res.rows[0] || null;
}

async function getMatchesSummary(userId) {
  const incomingSql = `
    SELECT
      l.source_user_id AS "userId",
      p.display_name AS "displayName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "age",
      ul.city,
      ul.country_code AS "countryCode",
      (u.email_verified_at IS NOT NULL) AS "isVerified",
      l.created_at AS "createdAt",
      (
        SELECT url FROM profile_photos
        WHERE user_id = l.source_user_id
        ORDER BY is_primary DESC, display_order ASC LIMIT 1
      ) AS "photoUrl"
    FROM likes l
    JOIN profiles p ON p.user_id = l.source_user_id
    JOIN users u ON u.id = l.source_user_id
    LEFT JOIN user_locations ul ON ul.user_id = l.source_user_id
    WHERE l.target_user_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM likes l2
        WHERE l2.source_user_id = $1 AND l2.target_user_id = l.source_user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = l.source_user_id)
           OR (b.blocker_user_id = l.source_user_id AND b.blocked_user_id = $1)
      )
    ORDER BY l.created_at DESC
    LIMIT 30
  `;

  const mutualSql = `
    SELECT
      m.id AS "matchId",
      CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END AS "userId",
      p.display_name AS "displayName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "age",
      ul.city,
      ul.country_code AS "countryCode",
      (u.email_verified_at IS NOT NULL) AS "isVerified",
      p.last_active_at AS "lastActiveAt",
      (p.last_active_at IS NOT NULL AND p.last_active_at > NOW() - INTERVAL '3 minutes') AS "isOnline",
      c.id AS "conversationId",
      (
        SELECT url FROM profile_photos
        WHERE user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
        ORDER BY is_primary DESC, display_order ASC LIMIT 1
      ) AS "photoUrl"
    FROM matches m
    JOIN profiles p ON p.user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
    JOIN users u ON u.id = p.user_id
    LEFT JOIN user_locations ul ON ul.user_id = p.user_id
    LEFT JOIN conversations c ON c.match_id = m.id
    WHERE (m.user_one_id = $1 OR m.user_two_id = $1)
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
           OR (b.blocked_user_id = $1 AND b.blocker_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
      )
    ORDER BY m.created_at DESC
    LIMIT 30
  `;

  const outgoingSql = `
    SELECT
      l.target_user_id AS "userId",
      p.display_name AS "displayName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "age",
      ul.city,
      ul.country_code AS "countryCode",
      (u.email_verified_at IS NOT NULL) AS "isVerified",
      l.created_at AS "createdAt",
      (
        SELECT url FROM profile_photos
        WHERE user_id = l.target_user_id
        ORDER BY is_primary DESC, display_order ASC LIMIT 1
      ) AS "photoUrl"
    FROM likes l
    JOIN profiles p ON p.user_id = l.target_user_id
    JOIN users u ON u.id = l.target_user_id
    LEFT JOIN user_locations ul ON ul.user_id = l.target_user_id
    WHERE l.source_user_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM likes l2
        WHERE l2.source_user_id = l.target_user_id AND l2.target_user_id = $1
      )
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = l.target_user_id)
           OR (b.blocker_user_id = l.target_user_id AND b.blocked_user_id = $1)
      )
    ORDER BY l.created_at DESC
    LIMIT 30
  `;

  const [incomingRes, mutualRes, outgoingRes] = await Promise.all([
    query(incomingSql, [userId]),
    query(mutualSql, [userId]),
    query(outgoingSql, [userId]),
  ]);

  return {
    incomingLikes: incomingRes.rows,
    mutualMatches: mutualRes.rows,
    outgoingLikes: outgoingRes.rows,
  };
}

module.exports = {
  getMatchesForUser,
  getMatchById,
  getMatchesSummary,
};
