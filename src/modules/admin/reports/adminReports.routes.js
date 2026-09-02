const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminReports.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('reports.read'), controller.listReports);
router.get('/:reportId', requirePermission('reports.read'), controller.getReportDetail);

router.post('/:reportId/assign', requirePermission('reports.assign'), controller.assignReport);
router.post('/:reportId/in-review', requirePermission('reports.assign'), controller.markInReview);
router.post('/:reportId/dismiss', requirePermission('reports.resolve'), controller.dismissReport);
router.post('/:reportId/resolve', requirePermission('reports.resolve'), controller.resolveReport);
router.post('/:reportId/escalate', requirePermission('reports.resolve'), controller.escalateReport);
router.post('/:reportId/notes', requirePermission('reports.resolve'), controller.addNote);

module.exports = router;
