const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminSupport.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('support.read'), controller.listCases);
router.post('/', requirePermission('support.reply'), controller.createCase);
router.get('/:caseId', requirePermission('support.read'), controller.getCaseDetail);
router.patch('/:caseId', requirePermission('support.reply'), controller.updateCase);
router.post('/:caseId/reply', requirePermission('support.reply'), controller.replyToCase);
router.post('/:caseId/assign', requirePermission('support.reply'), controller.assignCase);
router.post('/:caseId/notes', requirePermission('support.read'), controller.addInternalNote);
router.post('/:caseId/resolve', requirePermission('support.reply'), controller.resolveCase);

module.exports = router;
