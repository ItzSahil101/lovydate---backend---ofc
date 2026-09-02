const { query } = require('../../infrastructure/database/pool');

async function getActiveAnnouncements(userId = null) {
  const sql = `
    SELECT a.id, a.title, a.message, a.type, a.image_url AS "imageUrl",
           a.cta_label AS "ctaLabel", a.cta_destination AS "ctaDestination",
           a.cta_data AS "ctaData", a.priority, a.dismissible, a.created_at AS "createdAt"
    FROM announcements a
    WHERE a.is_active = TRUE
      AND (a.start_date IS NULL OR a.start_date <= NOW())
      AND (a.end_date IS NULL OR a.end_date > NOW())
      AND NOT EXISTS (
        SELECT 1 FROM announcement_dismissals ad
        WHERE ad.announcement_id = a.id AND ad.user_id = $1
      )
    ORDER BY a.priority DESC, a.created_at DESC
  `;

  const res = await query(sql, [userId || null]);
  return res.rows;
}

async function dismissAnnouncement(announcementId, userId) {
  if (!userId) return { success: true };

  await query(
    `INSERT INTO announcement_dismissals (user_id, announcement_id)
     VALUES ($1, $2)
     ON CONFLICT (user_id, announcement_id) DO NOTHING`,
    [userId, announcementId]
  );

  return { success: true };
}

module.exports = {
  getActiveAnnouncements,
  dismissAnnouncement,
};
