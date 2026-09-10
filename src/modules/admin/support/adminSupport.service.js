const supportRepo = require('./adminSupport.repository');
const { logAudit } = require('../audit/adminAudit.service');
const { NotFoundError, BadRequestError } = require('../../../shared/errors');
const { emitToSupportAdmins, emitToSupportCase } = require('../../../infrastructure/websocket/socketServer');

async function listCases(params, admin) {
  let assignedAdminId = params.assignedAdminId;
  if (params.assignedToMe === 'true' && admin) {
    assignedAdminId = admin.id;
  }
  return supportRepo.listCases({ ...params, assignedAdminId });
}

async function getCaseDetail(caseId) {
  const caseItem = await supportRepo.getCaseDetail(caseId);
  if (!caseItem) throw new NotFoundError('Support case not found');
  return caseItem;
}

async function createCase(data, admin, ipAddress) {
  if (!data.subject) {
    throw new BadRequestError('Subject is required');
  }

  const newCase = await supportRepo.createCase({
    ...data,
    adminId: admin.id,
  });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_CASE_CREATED',
    targetType: 'support_case',
    targetId: newCase.id,
    details: { subject: data.subject, userId: data.userId },
    ipAddress,
  });

  return newCase;
}

async function replyToCase(caseId, message, attachments, admin, ipAddress) {
  if (!message || !message.trim()) throw new BadRequestError('Message cannot be empty');

  const senderRole = admin.roles?.[0] || 'SUPER_ADMIN';
  const msg = await supportRepo.addMessage(
    caseId,
    'admin',
    admin.id,
    admin.displayName || 'Support Agent',
    senderRole,
    message.trim(),
    attachments || []
  );

  await supportRepo.updateCase(caseId, { status: 'waiting' });
  emitToSupportAdmins('support:message', { caseId, message: msg });
  emitToSupportCase(caseId, 'support:message', { caseId, message: msg });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_MESSAGE_SENT',
    targetType: 'support_case',
    targetId: caseId,
    details: { senderRole },
    ipAddress,
  });

  return msg;
}

async function assignCase(caseId, assignedAdminId, admin, ipAddress) {
  const updated = await supportRepo.updateCase(caseId, { assignedAdminId });
  if (!updated) throw new NotFoundError('Support case not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_CASE_ASSIGNED',
    targetType: 'support_case',
    targetId: caseId,
    details: { assignedAdminId },
    ipAddress,
  });

  emitToSupportAdmins('support:updated', { caseId, ticket: updated });
  emitToSupportCase(caseId, 'support:updated', { caseId, ticket: updated });
  return updated;
}

async function addInternalNote(caseId, note, admin, ipAddress) {
  if (!note || !note.trim()) throw new BadRequestError('Note cannot be empty');

  const record = await supportRepo.addInternalNote(caseId, note.trim(), admin.id);

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_NOTE_ADDED',
    targetType: 'support_case',
    targetId: caseId,
    details: { noteId: record.id },
    ipAddress,
  });

  return record;
}

async function resolveCase(caseId, resolutionSummary, admin, ipAddress) {
  if (!resolutionSummary || !resolutionSummary.trim()) {
    throw new BadRequestError('Resolution summary is required');
  }

  const updated = await supportRepo.updateCase(caseId, {
    status: 'resolved',
    resolutionSummary: resolutionSummary.trim(),
  });

  emitToSupportAdmins('support:updated', { caseId, ticket: updated });
  emitToSupportCase(caseId, 'support:updated', { caseId, ticket: updated });

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_CASE_RESOLVED',
    targetType: 'support_case',
    targetId: caseId,
    reason: resolutionSummary,
    ipAddress,
  });

  return updated;
}

async function updateCase(caseId, data, admin, ipAddress) {
  const updated = await supportRepo.updateCase(caseId, data);
  if (!updated) throw new NotFoundError('Support case not found');

  await logAudit({
    adminId: admin.id,
    adminEmail: admin.email,
    action: 'SUPPORT_CASE_UPDATED',
    targetType: 'support_case',
    targetId: caseId,
    details: data,
    ipAddress,
  });

  emitToSupportAdmins('support:updated', { caseId, ticket: updated });
  emitToSupportCase(caseId, 'support:updated', { caseId, ticket: updated });
  return updated;
}

module.exports = {
  listCases,
  getCaseDetail,
  createCase,
  replyToCase,
  assignCase,
  addInternalNote,
  resolveCase,
  updateCase,
};
