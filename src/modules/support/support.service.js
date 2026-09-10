const { query } = require('../../infrastructure/database/pool');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { BadRequestError, NotFoundError, ForbiddenError, UnauthorizedError } = require('../../shared/errors');
const { emitToSupportAdmins, emitToSupportCase } = require('../../infrastructure/websocket/socketServer');

function createTicketAccessToken(ticketId) {
  return jwt.sign(
    { ticketId, purpose: 'support-ticket' },
    env.jwt.secret,
    { expiresIn: '30d' }
  );
}

function requireTicketAccess(ticketId, accessToken) {
  if (!accessToken) {
    throw new UnauthorizedError('Support ticket access token is required', 'SUPPORT_TOKEN_REQUIRED');
  }
  try {
    const payload = jwt.verify(accessToken, env.jwt.secret);
    if (payload.purpose !== 'support-ticket' || payload.ticketId !== ticketId) throw new Error('scope');
    return payload;
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired support ticket access token', 'INVALID_SUPPORT_TOKEN');
  }
}

async function checkUserRestriction(userId, email) {
  if (!userId && !email) return null;

  let targetId = userId;
  if (!targetId && email) {
    const userRes = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.trim()]);
    targetId = userRes.rows[0]?.id || null;
  }

  if (!targetId) return null;

  const res = await query(
    `SELECT restriction_type AS "restrictionType", reason, expires_at AS "expiresAt"
     FROM user_restrictions
     WHERE user_id = $1
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY created_at DESC
     LIMIT 1`,
    [targetId]
  );

  return res.rows[0] || null;
}

async function createPublicTicket({ name, email, subject, category, message, attachments = [], priority = 'medium' }) {
  if (!name || !email || (!message && (!attachments || attachments.length === 0))) {
    throw new BadRequestError('Name, email, and message or attachment are required');
  }

  // Find if user already exists with this email
  const userRes = await query(`SELECT id FROM users WHERE LOWER(email) = LOWER($1)`, [email.toLowerCase().trim()]);
  const userId = userRes.rows[0]?.id || null;

  const caseRes = await query(
    `INSERT INTO support_cases (user_id, customer_name, customer_email, subject, category, priority, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'open')
     RETURNING id, subject, category, status, created_at AS "createdAt"`,
    [userId, name.trim(), email.toLowerCase().trim(), subject?.trim() || category || 'General Inquiry', category || 'General', priority]
  );
  const newCase = caseRes.rows[0];

  const msgRes = await query(
    `INSERT INTO support_messages (case_id, sender_type, sender_id, sender_name, sender_role, message, attachments)
     VALUES ($1, 'user', $2, $3, 'CUSTOMER', $4, $5)
     RETURNING id, sender_type AS "senderType", sender_name AS "senderName", sender_role AS "senderRole", message, attachments, created_at AS "createdAt"`,
    [newCase.id, userId, name.trim(), (message || '').trim(), JSON.stringify(attachments || [])]
  );

  const result = {
    ...newCase,
    initialMessage: msgRes.rows[0],
    accessToken: createTicketAccessToken(newCase.id),
  };
  emitToSupportAdmins('support:ticket:new', { ticket: newCase });
  return result;
}

async function getPublicTicket(ticketId, accessToken) {
  requireTicketAccess(ticketId, accessToken);
  const caseRes = await query(
    `SELECT sc.id, sc.subject, sc.category, sc.priority, sc.status,
            sc.customer_name AS "customerName", sc.customer_email AS "customerEmail",
            sc.created_at AS "createdAt", sc.resolved_at AS "resolvedAt",
            au.display_name AS "assignedAdminName",
            au.avatar_url AS "assignedAdminAvatar",
            COALESCE(au.last_login_at, au.updated_at, sc.created_at) AS "staffLastActiveAt"
     FROM support_cases sc
     LEFT JOIN admin_users au ON sc.assigned_admin_id = au.id
     WHERE sc.id = $1`,
    [ticketId]
  );

  if (caseRes.rows.length === 0) throw new NotFoundError('Support ticket not found');
  const ticket = caseRes.rows[0];

  // Global latest staff active timestamp
  const staffActiveRes = await query(`SELECT MAX(COALESCE(last_login_at, updated_at)) AS "latestStaffActiveAt" FROM admin_users WHERE status = 'ACTIVE'`);
  const latestStaffActiveAt = staffActiveRes.rows[0]?.latestStaffActiveAt || ticket.staffLastActiveAt;

  const restriction = await checkUserRestriction(ticket.userId, ticket.customerEmail);

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
    staffLastActiveAt: latestStaffActiveAt,
    isRestricted: Boolean(restriction),
    restrictionReason: restriction ? 'Messaging privileges are disabled on your account.' : null,
    messages: messagesRes.rows,
  };
}

async function sendCustomerMessage(ticketId, { name, message, attachments = [] }, accessToken) {
  requireTicketAccess(ticketId, accessToken);
  if (!message?.trim() && (!attachments || attachments.length === 0)) {
    throw new BadRequestError('Message or attachment is required');
  }

  const caseRes = await query(`SELECT id, user_id AS "userId", customer_email AS "customerEmail", status FROM support_cases WHERE id = $1`, [ticketId]);
  if (caseRes.rows.length === 0) throw new NotFoundError('Ticket not found');
  const ticket = caseRes.rows[0];

  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    throw new BadRequestError('This ticket has been resolved. The conversation has ended.', 'TICKET_RESOLVED');
  }

  const restriction = await checkUserRestriction(ticket.userId, ticket.customerEmail);
  if (restriction) {
    throw new ForbiddenError(
      'Messaging privileges are disabled on your account.',
      'MESSAGING_RESTRICTED'
    );
  }

  const msgRes = await query(
    `INSERT INTO support_messages (case_id, sender_type, sender_name, sender_role, message, attachments)
     VALUES ($1, 'user', $2, 'CUSTOMER', $3, $4)
     RETURNING id, sender_type AS "senderType", sender_name AS "senderName", sender_role AS "senderRole", message, attachments, created_at AS "createdAt"`,
    [ticketId, name || 'Customer', (message || '').trim(), JSON.stringify(attachments || [])]
  );

  const messageResult = msgRes.rows[0];
  emitToSupportAdmins('support:message', { caseId: ticketId, message: messageResult });
  emitToSupportCase(ticketId, 'support:message', { caseId: ticketId, message: messageResult });
  return messageResult;
}

async function getTicketsByEmail(email, user) {
  if (!email) return [];
  if (!user?.email || user.email.toLowerCase() !== email.toLowerCase().trim()) {
    throw new ForbiddenError('You may only view support tickets for your own account', 'SUPPORT_EMAIL_FORBIDDEN');
  }
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
