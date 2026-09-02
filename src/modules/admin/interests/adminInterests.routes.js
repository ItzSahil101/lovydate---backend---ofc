const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminInterests.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('interests.read'), controller.listInterests);
router.post('/', requirePermission('interests.manage'), controller.createInterest);
router.post('/reorder', requirePermission('interests.manage'), controller.reorderInterests);
router.get('/:interestId', requirePermission('interests.read'), controller.getInterestDetail);
router.patch('/:interestId', requirePermission('interests.manage'), controller.updateInterest);
router.post('/:interestId/enable', requirePermission('interests.manage'), controller.enableInterest);
router.post('/:interestId/disable', requirePermission('interests.manage'), controller.disableInterest);

module.exports = router;
