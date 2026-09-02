const { query } = require('../../infrastructure/database/pool');
const { BadRequestError, NotFoundError } = require('../../shared/errors');

async function createPublicTicket({ name, email, subject, category, message, priority = 'medium' }) {
  if (!name || !email || !message) {
    throw new BadRequestError('Name, email, and message are required');
  }

  // Find if user already exists with this email
  const userRes = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
  const userId = userRes.rows[0]?.id || null;

  const caseRes = await query(
    `INSERT INTO support_cases (user_id, customer_name, customer_email, subject, category, priority, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'open')
     RETURNING id, subject, category, status, created_at AS "createdAt"`,
    [userId, name.trim(), email.toLowerCase().trim(), subject?.trim() || 'General Inquiry', category || 'General', priority]
  );
  const newCase = caseRes.rows[0];

  const msgRes = await query(
    `INSERT INTO support_messages (case_id, sender_type, sender_id, sender_name, sender_role, message)
     VALUES ($1, 'user', $2, $3, 'CUSTOMER', $4)
     RETURNING id, sender_type AS "senderType", sender_name AS "senderName", sender_role AS "senderRole", message, created_at AS "createdAt"`,
    [newCase.id, userId, name.trim(), message.trim()]
  );

  return {
    ...newCase,
    initialMessage: msgRes.rows[0],
  };
}

async function getPublicTicket(ticketId) {
  const caseRes = await query(
    `SELECT sc.id, sc.subject, sc.category, sc.priority, sc.status,
            sc.customer_name AS "customerName", sc.customer_email AS "customerEmail",
            sc.created_at AS "createdAt", sc.resolved_at AS "resolvedAt",
            au.display_name AS "assignedAdminName"
     FROM support_cases sc
     LEFT JOIN admin_users au ON sc.assigned_admin_id = au.id
     WHERE sc.id = $1`,
    [ticketId]
  );

  if (caseRes.rows.length === 0) throw new NotFoundError('Support ticket not found');
  const ticket = caseRes.rows[0];

  const messagesRes = await query(
    `SELECT sm.id, sm.sender_type AS "senderType", sm.sender_id AS "senderId",
            sm.message, sm.attachments, sm.created_at AS "createdAt",
            COALESCE(sm.sender_name, CASE WHEN sm.sender_type = 'admin' THEN au.display_name ELSE p.display_name END, 'Customer') AS "senderName",
            COALESCE(sm.sender_role, CASE WHEN sm.sender_type = 'admin' THEN (SELECT role_id FROM admin_user_roles WHERE admin_id = sm.sender_id LIMIT 1) ELSE 'CUSTOMER' END, 'SUPPORT') AS "senderRole"
     FROM support_messages sm
     LEFT JOIN admin_users au ON sm.sender_type = 'admin' AND sm.sender_id = au.id
     LEFT JOIN profiles p ON sm.sender_type = 'user' AND sm.sender_id = p.user_id
     WHERE sm.case_id = $1
     ORDER BY sm.created_at ASC`,
    [ticketId]
  );

  return {
    ...ticket,
    messages: messagesRes.rows,
  };
}

async function sendCustomerMessage(ticketId, { name, message }) {
  if (!message || !message.trim()) {
    throw new BadRequestError('Message cannot be empty');
  }

  const caseRes = await query(`SELECT id, status FROM support_cases WHERE id = $1`, [ticketId]);
  if (caseRes.rows.length === 0) throw new NotFoundError('Ticket not found');

  const msgRes = await query(
    `INSERT INTO support_messages (case_id, sender_type, sender_name, sender_role, message)
     VALUES ($1, 'user', $2, 'CUSTOMER', $3)
     RETURNING id, sender_type AS "senderType", sender_name AS "senderName", sender_role AS "senderRole", message, created_at AS "createdAt"`,
    [ticketId, name || 'Customer', message.trim()]
  );

  // If case was waiting or resolved, reopen it to 'open'
  await query(`UPDATE support_cases SET status = 'open', updated_at = NOW() WHERE id = $1`, [ticketId]);

  return msgRes.rows[0];
}

async function getTicketsByEmail(email) {
  if (!email) return [];
  const res = await query(
    `SELECT sc.id, sc.subject, sc.category, sc.status, sc.created_at AS "createdAt",
            (SELECT message FROM support_messages WHERE case_id = sc.id ORDER BY created_at DESC LIMIT 1) AS "lastMessage",
            (SELECT created_at FROM support_messages WHERE case_id = sc.id ORDER BY created_at DESC LIMIT 1) AS "lastMessageAt"
     FROM support_cases sc
     WHERE LOWER(sc.customer_email) = LOWER($1)
     ORDER BY sc.updated_at DESC
     LIMIT 15`,
    [email.toLowerCase().trim()]
  );
  return res.rows;
}

module.exports = {
  createPublicTicket,
  getPublicTicket,
  sendCustomerMessage,
  getTicketsByEmail,
};
