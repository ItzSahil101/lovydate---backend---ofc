const { query } = require('../../../infrastructure/database/pool');
const { logAudit } = require('../audit/adminAudit.service');
const { BadRequestError, NotFoundError } = require('../../../shared/errors');
const adminCache = require('../adminCache');

const NOTIFICATION_STATS_CACHE_KEY = 'admin:notifications:stats';

async function getNotificationStats() {
  return adminCache.getOrSet(NOTIFICATION_STATS_CACHE_KEY, loadNotificationStats);
}

async function loadNotificationStats() {
  const [statusTodayRes, recentSendsRes, templatesRes] = await Promise.all([
    query(`
      SELECT
        COALESCE(SUM(sent_count), 0)::int AS "sentToday",
        COALESCE(SUM(delivered_count), 0)::int AS "deliveredToday",
        COALESCE(SUM(opened_count), 0)::int AS "openedToday",
        COALESCE(SUM(failed_count), 0)::int AS "failedToday"
      FROM notification_campaigns
      WHERE sent_at >= NOW() - INTERVAL '24 hours'
    `),
    query(
      `SELECT c.id, c.name, c.title, c.sent_at AS "sentAt", c.sent_count AS "sentCount",
              c.delivered_count AS "deliveredCount", c.opened_count AS "openedCount", c.status
       FROM notification_campaigns c
       WHERE c.status IN ('SENT', 'SENDING')
       ORDER BY c.sent_at DESC NULLS LAST
       LIMIT 10`
    ),
    query(`SELECT id, name, title, body, destination_type AS "destinationType", created_at AS "createdAt" FROM notification_templates ORDER BY name ASC`),
  ]);

  const statusToday = statusTodayRes.rows[0] || {};
  const sentToday = Number(statusToday.sentToday || 0);
  const deliveredToday = Number(statusToday.deliveredToday || 0);
  const openedToday = Number(statusToday.openedToday || 0);
  const failedToday = Number(statusToday.failedToday || 0);

  return {
    metrics: {
      sentToday,
      deliveredToday,
      openedToday,
      failedToday,
      openRate: sentToday > 0
        ? `${((openedToday / sentToday) * 100).toFixed(1)}%`
        : '0.0%',
    },
    recentSends: recentSendsRes.rows,
    templates: templatesRes.rows,
  };
}

async function listTemplates() {
  const res = await query(`SELECT id, name, title, body, destination_type AS "destinationType", created_at AS "createdAt" FROM notification_templates ORDER BY name ASC`);
  return res.rows;
}

async function createTemplate({ name, title, body, destinationType, destinationData, admin, ipAddress }) {
  if (!name || !title || !body) throw new BadRequestError('Template name, title, and body are required');

  const res = await query(
    `INSERT INTO notification_templates (name, title, body, destination_type, destination_data, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [name, title, body, destinationType || 'open_app', JSON.stringify(destinationData || {}), admin.id]
  );

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'NOTIFICATION_TEMPLATE_CREATED',
    targetType: 'template',
    targetId: res.rows[0].id,
    details: { name },
    ipAddress,
  });

  await adminCache.deleteByPattern(NOTIFICATION_STATS_CACHE_KEY);

  return res.rows[0];
}

async function updateTemplate({ id, name, title, body, destinationType, destinationData, admin, ipAddress }) {
  if (!id) throw new BadRequestError('Template ID is required');
  if (!name || !title || !body) throw new BadRequestError('Template name, title, and body are required');

  const res = await query(
    `UPDATE notification_templates
     SET name = $1, title = $2, body = $3, destination_type = $4,
         destination_data = $5, updated_at = NOW()
     WHERE id = $6
     RETURNING *`,
    [name, title, body, destinationType || 'open_app', JSON.stringify(destinationData || {}), id]
  );

  if (res.rows.length === 0) {
    throw new NotFoundError('Notification template not found');
  }

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'NOTIFICATION_TEMPLATE_UPDATED',
    targetType: 'template',
    targetId: id,
    details: { name },
    ipAddress,
  });

  await adminCache.deleteByPattern(NOTIFICATION_STATS_CACHE_KEY);

  return res.rows[0];
}

async function deleteTemplate({ id, admin, ipAddress }) {
  if (!id) throw new BadRequestError('Template ID is required');

  const existingRes = await query(`SELECT id, name FROM notification_templates WHERE id = $1`, [id]);
  if (existingRes.rows.length === 0) {
    throw new NotFoundError('Notification template not found');
  }

  await query(`DELETE FROM notification_templates WHERE id = $1`, [id]);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'NOTIFICATION_TEMPLATE_DELETED',
    targetType: 'template',
    targetId: id,
    details: { name: existingRes.rows[0].name },
    ipAddress,
  });

  await adminCache.deleteByPattern(NOTIFICATION_STATS_CACHE_KEY);

  return { success: true, id };
}

module.exports = {
  getNotificationStats,
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
};
