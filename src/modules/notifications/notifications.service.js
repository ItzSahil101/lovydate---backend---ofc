const notificationRepo = require('./notifications.repository');
const { query } = require('../../infrastructure/database/pool');

async function getNotifications(userId, limit = 40) {
  return notificationRepo.getNotifications(userId, limit);
}

async function getUnreadCount(userId) {
  return notificationRepo.getUnreadCount(userId);
}

async function markAsRead(userId, notificationId) {
  return notificationRepo.markAsRead(userId, notificationId);
}

async function markAllAsRead(userId) {
  return notificationRepo.markAllAsRead(userId);
}

async function createNotification(data) {
  return notificationRepo.createNotification(data);
}

// Extract mentions like @JaneDoe or @jane_doe from text, find user IDs and send notifications
async function notifyMentions({ senderId, text, entityId, type = 'mention' }) {
  if (!text) return [];

  // Match @username or @Name
  const mentionMatches = text.match(/@([a-zA-Z0-9_\.\-]+)/g);
  if (!mentionMatches || mentionMatches.length === 0) return [];

  const names = [...new Set(mentionMatches.map((m) => m.substring(1).trim()).filter(Boolean))];
  if (names.length === 0) return [];

  // Find user IDs for matching display names (case-insensitive)
  const sql = `
    SELECT p.user_id AS "userId", p.display_name AS "displayName"
    FROM profiles p
    WHERE LOWER(p.display_name) = ANY($1::text[])
  `;
  const lowerNames = names.map((n) => n.toLowerCase());
  const res = await query(sql, [lowerNames]);

  const senderProf = await query(
    `SELECT display_name AS "senderName" FROM profiles WHERE user_id = $1`,
    [senderId]
  );
  const senderName = senderProf.rows[0]?.senderName || 'Someone';

  const notifications = [];
  for (const user of res.rows) {
    if (user.userId !== senderId) {
      const notif = await notificationRepo.createNotification({
        recipientId: user.userId,
        senderId,
        type,
        entityId,
        message: `${senderName} mentioned you in a post`,
        metadata: { mentionedName: user.displayName },
      });
      if (notif) notifications.push(notif);
    }
  }

  return notifications;
}

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  createNotification,
  notifyMentions,
};
