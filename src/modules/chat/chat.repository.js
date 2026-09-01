const { query, withTransaction } = require('../../infrastructure/database/pool');

async function isConversationMember(conversationId, userId) {
  const res = await query(
    `SELECT 1 FROM conversation_members
     WHERE conversation_id = $1 AND user_id = $2`,
    [conversationId, userId]
  );
  return res.rows.length > 0;
}

async function getConversationsForUser(userId) {
  const sql = `
    SELECT
      c.id,
      c.updated_at AS "updatedAt",
      m.id AS "matchId",
      CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END AS "partnerUserId",
      p.display_name AS "partnerName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "partnerAge",
      ul.city AS "partnerCity",
      p.last_active_at AS "partnerLastActiveAt",
      (p.last_active_at IS NOT NULL AND p.last_active_at > NOW() - INTERVAL '3 minutes') AS "partnerIsOnline",
      (
        SELECT url FROM profile_photos
        WHERE user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
        ORDER BY is_primary DESC, display_order ASC
        LIMIT 1
      ) AS "partnerPhotoUrl",
      lm.id AS "lastMessageId",
      lm.content AS "lastMessageContent",
      lm.message_type AS "lastMessageType",
      lm.sender_id AS "lastMessageSenderId",
      lm.created_at AS "lastMessageCreatedAt",
      (
        SELECT COUNT(*)::int
        FROM messages msg
        WHERE msg.conversation_id = c.id
          AND msg.sender_id != $1
          AND (cm.last_read_message_id IS NULL OR msg.created_at > (
            SELECT created_at FROM messages WHERE id = cm.last_read_message_id
          ))
      ) AS "unreadCount",
      partner_cm.last_read_message_id AS "partnerLastReadMessageId"
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    JOIN matches m ON m.id = c.match_id
    JOIN profiles p ON p.user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
    LEFT JOIN user_locations ul ON ul.user_id = p.user_id
    LEFT JOIN conversation_members partner_cm ON partner_cm.conversation_id = c.id AND partner_cm.user_id != $1
    LEFT JOIN LATERAL (
      SELECT id, content, message_type, sender_id, created_at
      FROM messages
      WHERE conversation_id = c.id
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    ) lm ON TRUE
    WHERE cm.user_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = $1 AND b.blocked_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
           OR (b.blocked_user_id = $1 AND b.blocker_user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END)
      )
    ORDER BY c.updated_at DESC
  `;

  const res = await query(sql, [userId]);
  return res.rows;
}

async function getConversationDetails(conversationId, userId) {
  const sql = `
    SELECT
      c.id,
      c.updated_at AS "updatedAt",
      m.id AS "matchId",
      CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END AS "partnerUserId",
      p.display_name AS "partnerName",
      EXTRACT(YEAR FROM AGE(p.date_of_birth))::int AS "partnerAge",
      ul.city AS "partnerCity",
      p.bio AS "partnerBio",
      CASE WHEN COALESCE(up.show_online, TRUE) = FALSE OR COALESCE(up.is_incognito, FALSE) = TRUE THEN NULL ELSE p.last_active_at END AS "partnerLastActiveAt",
      (p.last_active_at IS NOT NULL AND p.last_active_at > NOW() - INTERVAL '3 minutes' AND COALESCE(up.show_online, TRUE) = TRUE AND COALESCE(up.is_incognito, FALSE) = FALSE) AS "partnerIsOnline",
      (
        SELECT url FROM profile_photos
        WHERE user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
        ORDER BY is_primary DESC, display_order ASC
        LIMIT 1
      ) AS "partnerPhotoUrl",
      partner_cm.last_read_message_id AS "partnerLastReadMessageId"
    FROM conversation_members cm
    JOIN conversations c ON c.id = cm.conversation_id
    JOIN matches m ON m.id = c.match_id
    JOIN profiles p ON p.user_id = CASE WHEN m.user_one_id = $1 THEN m.user_two_id ELSE m.user_one_id END
    LEFT JOIN user_locations ul ON ul.user_id = p.user_id
    LEFT JOIN user_preferences up ON up.user_id = p.user_id
    LEFT JOIN conversation_members partner_cm ON partner_cm.conversation_id = c.id AND partner_cm.user_id != $1
    WHERE cm.conversation_id = $2 AND cm.user_id = $1
  `;

  const res = await query(sql, [userId, conversationId]);
  return res.rows[0] || null;
}

async function getMessages(conversationId, limit = 50, cursor = null) {
  const values = [conversationId];
  let cursorClause = '';

  if (cursor && cursor.createdAt && cursor.id) {
    values.push(cursor.createdAt, cursor.id);
    cursorClause = 'AND (created_at, id) < ($2, $3)';
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  const sql = `
    SELECT
      id,
      conversation_id AS "conversationId",
      sender_id AS "senderId",
      content,
      message_type AS type,
      media_url AS "mediaUrl",
      media_mime_type AS "mimeType",
      media_size_bytes AS "sizeBytes",
      media_duration_seconds AS "durationSeconds",
      created_at AS "createdAt"
    FROM messages
    WHERE conversation_id = $1
      ${cursorClause}
    ORDER BY created_at DESC, id DESC
    LIMIT $${limitIdx}
  `;

  const res = await query(sql, values);
  const rows = res.rows;
  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).reverse();

  return {
    items,
    hasMore,
  };
}

async function insertMessage(conversationId, senderId, messageData) {
  return withTransaction(async (client) => {
    const msgRes = await client.query(
      `INSERT INTO messages (
         conversation_id, sender_id, content, message_type, media_url,
         media_mime_type, media_size_bytes, media_duration_seconds
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING
         id,
         conversation_id AS "conversationId",
         sender_id AS "senderId",
         content,
         message_type AS type,
         media_url AS "mediaUrl",
         media_mime_type AS "mimeType",
         media_size_bytes AS "sizeBytes",
         media_duration_seconds AS "durationSeconds",
         created_at AS "createdAt"`,
      [
        conversationId,
        senderId,
        messageData.content,
        messageData.type,
        messageData.mediaUrl,
        messageData.mimeType,
        messageData.sizeBytes,
        messageData.durationSeconds,
      ]
    );
    const message = msgRes.rows[0];

    await client.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return message;
  });
}

async function markConversationRead(conversationId, userId, lastMessageId) {
  await query(
    `UPDATE conversation_members
     SET last_read_message_id = $1
     WHERE conversation_id = $2 AND user_id = $3`,
    [lastMessageId, conversationId, userId]
  );
}

module.exports = {
  isConversationMember,
  getConversationsForUser,
  getConversationDetails,
  getMessages,
  insertMessage,
  markConversationRead,
};
