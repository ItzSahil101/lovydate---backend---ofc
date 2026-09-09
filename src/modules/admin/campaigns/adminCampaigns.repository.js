const { query } = require('../../../infrastructure/database/pool');

async function listCampaigns({ status, limit = 25, cursor }) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`c.status = $${params.length}`);
  }

  if (cursor) {
    params.push(cursor);
    conditions.push(`c.created_at < $${params.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const pageLimit = Math.min(parseInt(limit, 10) || 25, 100);
  params.push(pageLimit + 1);

  const sql = `
    SELECT c.id, c.name, c.title, c.body, c.image_key AS "imageKey",
           c.destination_type AS "destinationType", c.destination_data AS "destinationData",
           c.audience_type AS "audienceType", c.audience_filters AS "audienceFilters",
           c.status, c.scheduled_at AS "scheduledAt", c.sent_at AS "sentAt",
           c.audience_count AS "audienceCount", c.sent_count AS "sentCount",
           c.delivered_count AS "deliveredCount", c.opened_count AS "openedCount",
           c.failed_count AS "failedCount", c.created_at AS "createdAt",
           au.display_name AS "createdByName",
           s.name AS "segmentName"
    FROM notification_campaigns c
    LEFT JOIN admin_users au ON c.created_by = au.id
    LEFT JOIN admin_segments s ON c.segment_id = s.id
    ${whereClause}
    ORDER BY c.created_at DESC
    LIMIT $${params.length}
  `;

  const res = await query(sql, params);
  const hasMore = res.rows.length > pageLimit;
  const items = hasMore ? res.rows.slice(0, pageLimit) : res.rows;
  const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : null;

  return { items, nextCursor, hasMore };
}

async function getCampaignDetail(campaignId) {
  const res = await query(
    `SELECT c.id, c.name, c.title, c.body, c.image_key AS "imageKey",
            c.destination_type AS "destinationType", c.destination_data AS "destinationData",
            c.audience_type AS "audienceType", c.audience_filters AS "audienceFilters",
            c.segment_id AS "segmentId",
            c.status, c.scheduled_at AS "scheduledAt", c.sent_at AS "sentAt",
            c.audience_count AS "audienceCount", c.sent_count AS "sentCount",
            c.delivered_count AS "deliveredCount", c.opened_count AS "openedCount",
            c.failed_count AS "failedCount", c.created_at AS "createdAt",
            au.display_name AS "createdByName",
            s.name AS "segmentName"
     FROM notification_campaigns c
     LEFT JOIN admin_users au ON c.created_by = au.id
     LEFT JOIN admin_segments s ON c.segment_id = s.id
     WHERE c.id = $1`,
    [campaignId]
  );
  return res.rows[0] || null;
}

async function createCampaign({
  name,
  title,
  body,
  imageKey,
  destinationType,
  destinationData,
  audienceType,
  audienceFilters,
  segmentId,
  status,
  scheduledAt,
  audienceCount = 0,
  adminId,
}) {
  const finalStatus = 'DRAFT';

  const res = await query(
    `INSERT INTO notification_campaigns (
       name, title, body, image_key, destination_type, destination_data,
       audience_type, audience_filters, segment_id, status, scheduled_at,
       sent_at, audience_count, sent_count, delivered_count, opened_count, failed_count, created_by
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     RETURNING *`,
    [
      name,
      title,
      body,
      imageKey || null,
      destinationType || 'open_app',
      JSON.stringify(destinationData || {}),
      audienceType || 'everyone',
      JSON.stringify(audienceFilters || {}),
      segmentId || null,
      finalStatus,
      null,
      null,
      0,
      0,
      0,
      0,
      0,
      adminId,
    ]
  );
  return res.rows[0];
}

async function updateCampaign(campaignId, fields) {
  const updates = ['updated_at = NOW()'];
  const params = [campaignId];

  if (fields.name) {
    params.push(fields.name);
    updates.push(`name = $${params.length}`);
  }
  if (fields.title) {
    params.push(fields.title);
    updates.push(`title = $${params.length}`);
  }
  if (fields.body) {
    params.push(fields.body);
    updates.push(`body = $${params.length}`);
  }
  if (fields.imageKey !== undefined) {
    params.push(fields.imageKey);
    updates.push(`image_key = $${params.length}`);
  }
  if (fields.destinationType) {
    params.push(fields.destinationType);
    updates.push(`destination_type = $${params.length}`);
  }
  if (fields.destinationData) {
    params.push(JSON.stringify(fields.destinationData));
    updates.push(`destination_data = $${params.length}`);
  }
  if (fields.audienceType) {
    params.push(fields.audienceType);
    updates.push(`audience_type = $${params.length}`);
  }
  if (fields.audienceFilters) {
    params.push(JSON.stringify(fields.audienceFilters));
    updates.push(`audience_filters = $${params.length}`);
  }
  if (fields.status) {
    params.push(fields.status);
    updates.push(`status = $${params.length}`);
  }
  if (fields.scheduledAt !== undefined) {
    params.push(fields.scheduledAt);
    updates.push(`scheduled_at = $${params.length}`);
  }
  if (fields.sentAt !== undefined) {
    params.push(fields.sentAt);
    updates.push(`sent_at = $${params.length}`);
  }
  if (fields.audienceCount !== undefined) {
    params.push(fields.audienceCount);
    updates.push(`audience_count = $${params.length}`);
  }
  if (fields.sentCount !== undefined) {
    params.push(fields.sentCount);
    updates.push(`sent_count = $${params.length}`);
  }
  if (fields.deliveredCount !== undefined) {
    params.push(fields.deliveredCount);
    updates.push(`delivered_count = $${params.length}`);
  }
  if (fields.failedCount !== undefined) {
    params.push(fields.failedCount);
    updates.push(`failed_count = $${params.length}`);
  }

  const sql = `
    UPDATE notification_campaigns
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING *
  `;

  const res = await query(sql, params);
  return res.rows[0];
}

async function deleteCampaign(campaignId) {
  const res = await query(`DELETE FROM notification_campaigns WHERE id = $1 RETURNING id`, [campaignId]);
  return res.rows[0] || null;
}

function buildAudienceQuery(audienceType, audienceFilters = {}) {
  const conditions = ["u.status = 'active'"];
  const params = [];

  // Only apply demographic / activity filters when targeting 'custom'
  if (audienceType === 'custom' && audienceFilters) {
    if (audienceFilters.gender && typeof audienceFilters.gender === 'string' && audienceFilters.gender.trim()) {
      const g = audienceFilters.gender.trim().toLowerCase();
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

    if (audienceFilters.minAge && Number(audienceFilters.minAge) > 18) {
      params.push(parseInt(audienceFilters.minAge, 10));
      conditions.push(`(p.date_of_birth IS NOT NULL AND EXTRACT(YEAR FROM age(CURRENT_DATE, p.date_of_birth)) >= $${params.length})`);
    }

    if (audienceFilters.maxAge && Number(audienceFilters.maxAge) > 0 && Number(audienceFilters.maxAge) < 70) {
      params.push(parseInt(audienceFilters.maxAge, 10));
      conditions.push(`(p.date_of_birth IS NOT NULL AND EXTRACT(YEAR FROM age(CURRENT_DATE, p.date_of_birth)) <= $${params.length})`);
    }

    if (audienceFilters.onboardingCompleted !== undefined && audienceFilters.onboardingCompleted !== null && audienceFilters.onboardingCompleted !== '') {
      params.push(Boolean(audienceFilters.onboardingCompleted));
      conditions.push(`p.onboarding_completed = $${params.length}`);
    }

    if (audienceFilters.activeWithinDays && Number(audienceFilters.activeWithinDays) > 0) {
      params.push(parseInt(audienceFilters.activeWithinDays, 10));
      conditions.push(`p.last_active_at >= NOW() - ($${params.length} || ' days')::interval`);
    }
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { whereClause, params };
}

async function countAudience(audienceType = 'everyone', audienceFilters = {}, segmentId = null) {
  let effectiveFilters = audienceFilters;
  let effectiveType = audienceType;

  if (audienceType === 'segment' && segmentId) {
    const segRes = await query(`SELECT filters FROM admin_segments WHERE id = $1`, [segmentId]);
    if (segRes.rows.length > 0) {
      effectiveFilters = typeof segRes.rows[0].filters === 'string' ? JSON.parse(segRes.rows[0].filters) : segRes.rows[0].filters;
      effectiveType = 'custom';
    }
  }

  const { whereClause, params } = buildAudienceQuery(effectiveType, effectiveFilters);
  const sql = `
    SELECT COUNT(DISTINCT u.id) as count
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ${whereClause}
  `;

  const res = await query(sql, params);
  return parseInt(res.rows[0]?.count || 0, 10);
}

async function getAudienceUserIds(audienceType = 'everyone', audienceFilters = {}, segmentId = null) {
  let effectiveFilters = audienceFilters;
  let effectiveType = audienceType;

  if (audienceType === 'segment' && segmentId) {
    const segRes = await query(`SELECT filters FROM admin_segments WHERE id = $1`, [segmentId]);
    if (segRes.rows.length > 0) {
      effectiveFilters = typeof segRes.rows[0].filters === 'string' ? JSON.parse(segRes.rows[0].filters) : segRes.rows[0].filters;
      effectiveType = 'custom';
    }
  }

  const { whereClause, params } = buildAudienceQuery(effectiveType, effectiveFilters);
  const sql = `
    SELECT DISTINCT u.id
    FROM users u
    LEFT JOIN profiles p ON u.id = p.user_id
    ${whereClause}
  `;

  const res = await query(sql, params);
  return res.rows.map((r) => r.id);
}

module.exports = {
  listCampaigns,
  getCampaignDetail,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  countAudience,
  getAudienceUserIds,
};
