const { query, withTransaction } = require('../../../infrastructure/database/pool');

async function listUsers({
  search,
  status,
  gender,
  onboardingCompleted,
  emailVerified,
  sort = 'newest',
  limit = 25,
  cursor,
}) {
  const conditions = [];
  const params = [];

  if (search) {
    const normalizedSearch = search.trim().toLowerCase();
    params.push(`%${normalizedSearch}%`);
    const likeParam = params.length;
    params.push(normalizedSearch);
    const exactParam = params.length;
    conditions.push(`(
      LOWER(u.email) LIKE $${likeParam}
      OR LOWER(p.display_name) LIKE $${likeParam}
      OR u.id::text = $${exactParam}
    )`);
  }

  if (status) {
    params.push(status);
    conditions.push(`u.status = $${params.length}`);
  }

  if (gender) {
    const g = gender.trim().toLowerCase();
    if (g === 'male' || g === 'man' || g === 'men') {
      conditions.push(`(LOWER(p.gender) IN ('male', 'man', 'men'))`);
    } else if (g === 'female' || g === 'woman' || g === 'women') {
      conditions.push(`(LOWER(p.gender) IN ('female', 'woman', 'women'))`);
    } else if (g === 'non_binary' || g === 'non-binary' || g === 'nonbinary') {
      conditions.push(`(
        LOWER(COALESCE(p.gender, '')) NOT IN ('male', 'man', 'men', 'female', 'woman', 'women')
        OR LOWER(COALESCE(p.gender, '')) LIKE '%non%binary%'
        OR LOWER(COALESCE(p.custom_gender, '')) LIKE '%non%binary%'
      )`);
    } else {
      params.push(g);
      conditions.push(`(LOWER(p.gender) = $${params.length} OR LOWER(COALESCE(p.custom_gender, '')) = $${params.length})`);
    }
  }

  if (onboardingCompleted !== undefined && onboardingCompleted !== null && onboardingCompleted !== '') {
    params.push(onboardingCompleted === 'true' || onboardingCompleted === true);
    conditions.push(`p.onboarding_completed = $${params.length}`);
  }

  if (emailVerified !== undefined && emailVerified !== null && emailVerified !== '') {
    if (emailVerified === 'true' || emailVerified === true) {
      conditions.push(`u.email_verified_at IS NOT NULL`);
    } else {
      conditions.push(`u.email_verified_at IS NULL`);
    }
  }

  let orderClause = 'ORDER BY u.created_at DESC';
  if (sort === 'oldest') {
    orderClause = 'ORDER BY u.created_at ASC';
    if (cursor) {
      params.push(cursor);
      conditions.push(`u.created_at > $${params.length}`);
    }
  } else if (sort === 'recently_active') {
    orderClause = 'ORDER BY p.last_active_at DESC NULLS LAST, u.created_at DESC';
    if (cursor) {
      params.push(cursor);
      conditions.push(`p.last_active_at < $${params.length}`);
    }
  } else if (sort === 'most_reported') {
    orderClause = 'ORDER BY report_count DESC, u.created_at DESC';
  } else {
    // default newest
    if (cursor) {
      params.push(cursor);
      conditions.push(`u.created_at < $${params.length}`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT u.id, u.email, u.status, u.google_id IS NOT NULL AS "isGoogleSignup",
           u.email_verified_at AS "emailVerifiedAt", u.created_at AS "createdAt",
           p.display_name AS "displayName", p.date_of_birth AS "dateOfBirth",
           p.gender, p.onboarding_completed AS "onboardingCompleted",
           p.last_active_at AS "lastActiveAt",
           loc.city, loc.country_code AS "countryCode",
           (SELECT url FROM profile_photos WHERE user_id = u.id AND is_primary = true LIMIT 1) AS "primaryPhoto",
           COALESCE(rep.report_count, 0)::int AS "reportCount",
           COALESCE(rest.active_restrictions_count, 0)::int AS "activeRestrictionsCount"
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    LEFT JOIN user_locations loc ON u.id = loc.user_id
    LEFT JOIN (
      SELECT reported_user_id, COUNT(*) AS report_count
      FROM reports
      GROUP BY reported_user_id
    ) rep ON rep.reported_user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS active_restrictions_count
      FROM user_restrictions
      WHERE is_active = true AND (expires_at IS NULL OR expires_at > NOW())
      GROUP BY user_id
    ) rest ON rest.user_id = u.id
    ${whereClause}
    ${orderClause}
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0
    ? (sort === 'recently_active' ? items[items.length - 1].lastActiveAt : items[items.length - 1].createdAt)
    : null;

  return {
    items,
    nextCursor,
    hasMore,
  };
}

async function getUserDetail(userId) {
  const userRes = await query(
    `SELECT u.id, u.email, u.status, u.google_id IS NOT NULL AS "isGoogleSignup",
            u.email_verified_at AS "emailVerifiedAt", u.created_at AS "createdAt", u.updated_at AS "updatedAt",
            p.display_name AS "displayName", p.date_of_birth AS "dateOfBirth",
            p.gender, p.custom_gender AS "customGender", p.relationship_goal AS "relationshipGoal",
            p.bio, p.onboarding_completed AS "onboardingCompleted", p.last_active_at AS "lastActiveAt",
            loc.city, loc.country_code AS "countryCode",
            pref.min_age AS "prefMinAge", pref.max_age AS "prefMaxAge",
            pref.max_distance_meters AS "prefMaxDistance", pref.interested_in AS "prefInterestedIn"
     FROM users u
     LEFT JOIN profiles p ON u.id = p.user_id
     LEFT JOIN user_locations loc ON u.id = loc.user_id
     LEFT JOIN user_preferences pref ON u.id = pref.user_id
     WHERE u.id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) return null;
  const user = userRes.rows[0];

  // Photos
  const photosRes = await query(
    `SELECT id, url, display_order AS "displayOrder", is_primary AS "isPrimary", moderation_status AS "moderationStatus", created_at AS "createdAt"
     FROM profile_photos
     WHERE user_id = $1
     ORDER BY display_order ASC, created_at ASC`,
    [userId]
  );

  // Interests
  const interestsRes = await query(
    `SELECT i.id, i.name, i.category, i.icon_name AS "iconName"
     FROM user_interests ui
     JOIN interests i ON ui.interest_id = i.id
     WHERE ui.user_id = $1`,
    [userId]
  );

  // Aggregate Stats
  const [likesSentRes, likesRecRes, matchesRes, msgsRes, postsRes, repRecRes, repSubRes] = await Promise.all([
    query(`SELECT COUNT(*) as count FROM likes WHERE source_user_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM likes WHERE target_user_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM matches WHERE user_one_id = $1 OR user_two_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM messages WHERE sender_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM posts WHERE user_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM reports WHERE reported_user_id = $1`, [userId]),
    query(`SELECT COUNT(*) as count FROM reports WHERE reporter_user_id = $1`, [userId]),
  ]);

  return {
    ...user,
    photos: photosRes.rows,
    interests: interestsRes.rows,
    stats: {
      likesSent: parseInt(likesSentRes.rows[0]?.count || 0, 10),
      likesReceived: parseInt(likesRecRes.rows[0]?.count || 0, 10),
      matches: parseInt(matchesRes.rows[0]?.count || 0, 10),
      messagesSent: parseInt(msgsRes.rows[0]?.count || 0, 10),
      feedPosts: parseInt(postsRes.rows[0]?.count || 0, 10),
      reportsReceived: parseInt(repRecRes.rows[0]?.count || 0, 10),
      reportsSubmitted: parseInt(repSubRes.rows[0]?.count || 0, 10),
    },
  };
}

async function getUserActivityTimeline(userId, limit = 30) {
  // Synthesize safe timeline events
  const timeline = [];

  const warnings = await query(
    `SELECT id, 'warning' AS type, reason AS title, message AS description, created_at AS "createdAt"
     FROM user_warnings WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  warnings.rows.forEach(w => timeline.push(w));

  const restrictions = await query(
    `SELECT id, 'restriction' AS type, restriction_type AS title, reason AS description, created_at AS "createdAt"
     FROM user_restrictions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  restrictions.rows.forEach(r => timeline.push(r));

  const posts = await query(
    `SELECT id, 'post_created' AS type, 'Feed Post' AS title, SUBSTRING(content FROM 1 FOR 60) AS description, created_at AS "createdAt"
     FROM posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  posts.rows.forEach(p => timeline.push(p));

  const matches = await query(
    `SELECT id, 'matched' AS type, 'New Match' AS title, 'Matched with another user' AS description, created_at AS "createdAt"
     FROM matches WHERE user_one_id = $1 OR user_two_id = $1 ORDER BY created_at DESC LIMIT 10`,
    [userId]
  );
  matches.rows.forEach(m => timeline.push(m));

  timeline.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return timeline.slice(0, limit);
}

async function getUserModerationHistory(userId) {
  const [reports, warnings, restrictions, appeals, notes] = await Promise.all([
    query(
      `SELECT r.id, r.category, r.priority, r.reason, r.details, r.status, r.created_at AS "createdAt",
              p.display_name AS "reporterName"
       FROM reports r
       LEFT JOIN profiles p ON r.reporter_user_id = p.user_id
       WHERE r.reported_user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    ),
    query(
      `SELECT id, reason, message, is_acknowledged AS "isAcknowledged", created_at AS "createdAt"
       FROM user_warnings WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    ),
    query(
      `SELECT id, restriction_type AS "restrictionType", reason, internal_note AS "internalNote",
              is_active AS "isActive", expires_at AS "expiresAt", created_at AS "createdAt"
       FROM user_restrictions WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    ),
    query(
      `SELECT id, appeal_type AS "appealType", reason, status, resolution_note AS "resolutionNote", created_at AS "createdAt"
       FROM moderation_appeals WHERE user_id = $1 ORDER BY created_at DESC`,
      [userId]
    ),
    query(
      `SELECT mn.id, mn.note, mn.created_at AS "createdAt", au.display_name AS "adminName"
       FROM moderation_notes mn
       LEFT JOIN admin_users au ON mn.admin_id = au.id
       WHERE mn.entity_type = 'user' AND mn.entity_id = $1
       ORDER BY mn.created_at DESC`,
      [userId]
    ),
  ]);

  return {
    reports: reports.rows,
    warnings: warnings.rows,
    restrictions: restrictions.rows,
    appeals: appeals.rows,
    notes: notes.rows,
  };
}

async function addWarning(userId, reason, message, adminId) {
  const res = await query(
    `INSERT INTO user_warnings (user_id, reason, message, admin_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, reason, message, created_at AS "createdAt"`,
    [userId, reason, message, adminId]
  );
  return res.rows[0];
}

async function addRestriction(userId, restrictionType, reason, internalNote, expiresAt, adminId) {
  const res = await query(
    `INSERT INTO user_restrictions (user_id, restriction_type, reason, internal_note, expires_at, is_active, admin_id)
     VALUES ($1, $2, $3, $4, $5, true, $6)
     RETURNING id, restriction_type AS "restrictionType", reason, is_active AS "isActive", expires_at AS "expiresAt", created_at AS "createdAt"`,
    [userId, restrictionType, reason, internalNote, expiresAt || null, adminId]
  );

  if (restrictionType === 'ACCOUNT_SUSPENSION') {
    await query(`UPDATE users SET status = 'suspended', updated_at = NOW() WHERE id = $1`, [userId]);
  }

  return res.rows[0];
}

async function removeRestriction(restrictionId, userId) {
  await query(`UPDATE user_restrictions SET is_active = false, updated_at = NOW() WHERE id = $1`, [restrictionId]);
  // Check if any active suspensions remain
  const check = await query(
    `SELECT 1 FROM user_restrictions WHERE user_id = $1 AND restriction_type = 'ACCOUNT_SUSPENSION' AND is_active = true`,
    [userId]
  );
  if (check.rows.length === 0) {
    await query(`UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1 AND status = 'suspended'`, [userId]);
  }
}

async function unsuspendUser(userId) {
  await query(
    `UPDATE user_restrictions SET is_active = false, updated_at = NOW()
     WHERE user_id = $1 AND restriction_type = 'ACCOUNT_SUSPENSION' AND is_active = true`,
    [userId]
  );
  await query(`UPDATE users SET status = 'active', updated_at = NOW() WHERE id = $1`, [userId]);
}

async function deactivateUser(userId) {
  await query(`UPDATE users SET status = 'deleted', updated_at = NOW() WHERE id = $1`, [userId]);
}

async function addModerationNote(entityType, entityId, note, adminId) {
  const res = await query(
    `INSERT INTO moderation_notes (entity_type, entity_id, note, admin_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id, note, created_at AS "createdAt"`,
    [entityType, entityId, note, adminId]
  );
  return res.rows[0];
}

async function deleteUserRefreshTokens(userId) {
  await query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);
  await query(`UPDATE users SET auth_revoked_at = NOW(), updated_at = NOW() WHERE id = $1`, [userId]);
}

module.exports = {
  listUsers,
  getUserDetail,
  getUserActivityTimeline,
  getUserModerationHistory,
  addWarning,
  addRestriction,
  removeRestriction,
  unsuspendUser,
  deactivateUser,
  addModerationNote,
  deleteUserRefreshTokens,
};
