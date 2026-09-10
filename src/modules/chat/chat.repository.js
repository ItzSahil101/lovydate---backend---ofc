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
      CASE WHEN lm.is_unsent THEN 'Message unsent' ELSE lm.content END AS "lastMessageContent",
      lm.message_type AS "lastMessageType",
      lm.sender_id AS "lastMessageSenderId",
      lm.created_at AS "lastMessageCreatedAt",
      (
        SELECT COUNT(*)::int
        FROM messages msg
        WHERE msg.conversation_id = c.id
          AND msg.sender_id != $1
          AND msg.is_unsent = FALSE
          AND NOT EXISTS (SELECT 1 FROM message_deletions md
            WHERE md.message_id = msg.id AND md.user_id = $1)
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
      SELECT msg.id, msg.content, msg.message_type, msg.sender_id, msg.created_at, msg.is_unsent
      FROM messages msg
      WHERE msg.conversation_id = c.id
        AND NOT EXISTS (
          SELECT 1 FROM message_deletions md
          WHERE md.message_id = msg.id AND md.user_id = $1
        )
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

const messageFields = `
  msg.id,
  msg.conversation_id AS "conversationId",
  msg.sender_id AS "senderId",
  CASE WHEN msg.is_unsent THEN '' ELSE msg.content END AS content,
  msg.message_type AS type,
  CASE WHEN msg.is_unsent THEN NULL ELSE msg.media_url END AS "mediaUrl",
  CASE WHEN msg.is_unsent THEN NULL ELSE msg.media_mime_type END AS "mimeType",
  CASE WHEN msg.is_unsent THEN NULL ELSE msg.media_size_bytes END AS "sizeBytes",
  CASE WHEN msg.is_unsent THEN NULL ELSE msg.media_duration_seconds END AS "durationSeconds",
  msg.is_unsent AS "isUnsent",
  msg.created_at AS "createdAt",
  EXISTS (
    SELECT 1 FROM conversation_members reader
    JOIN messages read_msg ON read_msg.id = reader.last_read_message_id
    WHERE reader.conversation_id = msg.conversation_id
      AND reader.user_id != msg.sender_id
      AND (read_msg.created_at, read_msg.id) >= (msg.created_at, msg.id)
  ) AS "isSeen",
  CASE WHEN msg.is_unsent OR reply.id IS NULL OR reply_deleted.message_id IS NOT NULL THEN NULL ELSE json_build_object(
    'id', reply.id,
    'senderId', reply.sender_id,
    'content', CASE WHEN reply.is_unsent THEN '' ELSE reply.content END,
    'type', reply.message_type,
    'isUnsent', reply.is_unsent
  ) END AS "replyTo",
  CASE WHEN msg.is_unsent THEN '[]'::json ELSE COALESCE(reaction_data.reactions, '[]'::json) END AS reactions`;

const messageJoins = `
  LEFT JOIN messages reply ON reply.id = msg.reply_to_message_id
  LEFT JOIN message_deletions reply_deleted
    ON reply_deleted.message_id = reply.id AND reply_deleted.user_id = $2
  LEFT JOIN LATERAL (
    SELECT json_agg(
      json_build_object('userId', mr.user_id, 'emoji', mr.emoji)
      ORDER BY mr.created_at, mr.user_id
    ) AS reactions
    FROM message_reactions mr
    WHERE mr.message_id = msg.id
  ) reaction_data ON TRUE`;

async function getMessages(conversationId, userId, limit = 50, cursor = null) {
  const values = [conversationId, userId];
  let cursorClause = '';

  if (cursor && cursor.createdAt && cursor.id) {
    values.push(cursor.createdAt, cursor.id);
    cursorClause = 'AND (msg.created_at, msg.id) < ($3, $4)';
  }

  values.push(limit + 1);
  const limitIdx = values.length;

  const sql = `
    SELECT ${messageFields}
    FROM messages msg
    ${messageJoins}
    WHERE msg.conversation_id = $1
      AND NOT EXISTS (
        SELECT 1 FROM message_deletions md
        WHERE md.message_id = msg.id AND md.user_id = $2
      )
      ${cursorClause}
    ORDER BY msg.created_at DESC, msg.id DESC
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

async function getMessage(conversationId, messageId, userId) {
  const res = await query(
    `SELECT ${messageFields}
     FROM messages msg
     ${messageJoins}
     WHERE msg.conversation_id = $1 AND msg.id = $3
       AND NOT EXISTS (SELECT 1 FROM message_deletions md
         WHERE md.message_id = msg.id AND md.user_id = $2)`,
    [conversationId, userId, messageId]
  );
  return res.rows[0] || null;
}

async function insertMessage(conversationId, senderId, messageData) {
  const messageId = await withTransaction(async (client) => {
    const msgRes = await client.query(
      `INSERT INTO messages (
         conversation_id, sender_id, content, message_type, media_url,
         media_mime_type, media_size_bytes, media_duration_seconds,
         reply_to_message_id
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
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
        messageData.replyToMessageId,
      ]
    );
    const message = msgRes.rows[0];

    await client.query(
      'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
      [conversationId]
    );

    return message.id;
  });
  return getMessage(conversationId, messageId, senderId);
}

async function setReaction(conversationId, messageId, userId, emoji) {
  await query(
    `INSERT INTO message_reactions (message_id, user_id, emoji)
     SELECT msg.id, $3, $4 FROM messages msg
     WHERE msg.id = $2 AND msg.conversation_id = $1 AND msg.is_unsent = FALSE
     ON CONFLICT (message_id, user_id)
     DO UPDATE SET emoji = EXCLUDED.emoji, updated_at = NOW()`,
    [conversationId, messageId, userId, emoji]
  );
  return getMessage(conversationId, messageId, userId);
}

async function removeReaction(messageId, userId) {
  await query(
    'DELETE FROM message_reactions WHERE message_id = $1 AND user_id = $2',
    [messageId, userId]
  );
}

async function deleteMessageForUser(conversationId, messageId, userId) {
  const res = await query(
    `INSERT INTO message_deletions (message_id, user_id)
     SELECT msg.id, $3 FROM messages msg
     WHERE msg.id = $2 AND msg.conversation_id = $1
     ON CONFLICT (message_id, user_id) DO NOTHING
     RETURNING message_id`,
    [conversationId, messageId, userId]
  );
  return res.rowCount > 0;
}

async function unsendMessage(conversationId, messageId, senderId) {
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE messages SET
         content = '', media_url = NULL, media_mime_type = NULL,
         media_size_bytes = NULL, media_duration_seconds = NULL,
         is_unsent = TRUE, unsent_at = COALESCE(unsent_at, NOW())
       WHERE id = $2 AND conversation_id = $1 AND sender_id = $3`,
      [conversationId, messageId, senderId]
    );
    await client.query('DELETE FROM message_reactions WHERE message_id = $1', [messageId]);
  });
  return getMessage(conversationId, messageId, senderId);
}

async function markConversationRead(conversationId, userId, lastMessageId) {
  await query(
    `UPDATE conversation_members
     SET last_read_message_id = $1
     WHERE conversation_id = $2 AND user_id = $3
       AND (last_read_message_id IS NULL OR
         (SELECT (created_at, id) FROM messages WHERE id = $1) >=
         (SELECT (created_at, id) FROM messages WHERE id = last_read_message_id))`,
    [lastMessageId, conversationId, userId]
  );
}

module.exports = {
  isConversationMember,
  getConversationsForUser,
  getConversationDetails,
  getMessages,
  getMessage,
  insertMessage,
  setReaction,
  removeReaction,
  deleteMessageForUser,
  unsendMessage,
  markConversationRead,
};
