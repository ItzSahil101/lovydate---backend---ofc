const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminSupport.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('support.read'), controller.listCases);
router.post('/', requirePermission('support.manage'), controller.createCase);
router.get('/:caseId', requirePermission('support.read'), controller.getCaseDetail);
router.patch('/:caseId', requirePermission('support.manage'), controller.updateCase);
router.post('/:caseId/messages', requirePermission('support.manage'), controller.replyToCase);
router.post('/:caseId/notes', requirePermission('support.manage'), controller.addInternalNote);
router.post('/:caseId/resolve', requirePermission('support.manage'), controller.resolveCase);

module.exports = router;
