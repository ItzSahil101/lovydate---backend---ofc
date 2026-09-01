const { query } = require('../../infrastructure/database/pool');

async function createNotification({
  recipientId,
  senderId,
  type,
  entityId = null,
  message = null,
  metadata = {},
}) {
  // Avoid self-notifications
  if (recipientId === senderId) return null;

  const blocked = await query(
    `SELECT 1 FROM blocks
     WHERE (blocker_user_id = $1 AND blocked_user_id = $2)
        OR (blocker_user_id = $2 AND blocked_user_id = $1)
     LIMIT 1`,
    [recipientId, senderId]
  );
  if (blocked.rows.length > 0) return null;

  const sql = `
    INSERT INTO notifications (recipient_id, sender_id, type, entity_id, message, metadata, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    RETURNING id, recipient_id AS "recipientId", sender_id AS "senderId", type, entity_id AS "entityId", message, metadata, is_read AS "isRead", created_at AS "createdAt"
  `;

  const res = await query(sql, [recipientId, senderId, type, entityId, message, JSON.stringify(metadata)]);
  return res.rows[0];
}

async function getNotifications(userId, limit = 40) {
  const sql = `
    SELECT
      n.id,
      n.recipient_id AS "recipientId",
      n.sender_id AS "senderId",
      n.type,
      n.entity_id AS "entityId",
      n.message,
      n.metadata,
      n.is_read AS "isRead",
      n.created_at AS "createdAt",
      prof.display_name AS "senderName",
      (
        SELECT url FROM profile_photos
        WHERE user_id = n.sender_id
        ORDER BY display_order ASC LIMIT 1
      ) AS "senderAvatar"
    FROM notifications n
    JOIN profiles prof ON prof.user_id = n.sender_id
    WHERE n.recipient_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = n.sender_id)
           OR (b.blocked_user_id = $1 AND b.blocker_user_id = n.sender_id)
      )
    ORDER BY n.created_at DESC
    LIMIT $2
  `;

  const res = await query(sql, [userId, limit]);
  return res.rows;
}

async function getUnreadCount(userId) {
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM notifications
    WHERE recipient_id = $1 AND is_read = FALSE
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = notifications.sender_id)
           OR (b.blocked_user_id = $1 AND b.blocker_user_id = notifications.sender_id)
      )
  `;

  const res = await query(sql, [userId]);
  return res.rows[0]?.count || 0;
}

async function markAsRead(userId, notificationId) {
  const sql = `
    UPDATE notifications
    SET is_read = TRUE
    WHERE id = $1 AND recipient_id = $2
    RETURNING id, is_read AS "isRead"
  `;

  const res = await query(sql, [notificationId, userId]);
  return res.rows[0] || null;
}

async function markAllAsRead(userId) {
  const sql = `
    UPDATE notifications
    SET is_read = TRUE
    WHERE recipient_id = $1 AND is_read = FALSE
  `;

  await query(sql, [userId]);
  return true;
}

module.exports = {
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};
