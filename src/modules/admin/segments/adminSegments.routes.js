const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminSegments.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('segments.read'), controller.listSegments);
router.post('/', requirePermission('segments.manage'), controller.createSegment);
router.post('/estimate', requirePermission('segments.read'), controller.estimateSegment);
router.get('/:segmentId', requirePermission('segments.read'), controller.getSegmentDetail);
router.patch('/:segmentId', requirePermission('segments.manage'), controller.updateSegment);
router.delete('/:segmentId', requirePermission('segments.manage'), controller.deleteSegment);

module.exports = router;
