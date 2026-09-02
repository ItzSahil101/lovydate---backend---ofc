const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminUsers.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('users.read'), controller.listUsers);
router.get('/:userId', requirePermission('users.read'), controller.getUserDetail);
router.get('/:userId/activity', requirePermission('users.read'), controller.getUserActivity);
router.get('/:userId/moderation', requirePermission('users.read'), controller.getUserModeration);

router.post('/:userId/warn', requirePermission('users.warn'), controller.warnUser);
router.post('/:userId/suspend', requirePermission('users.suspend'), controller.suspendUser);
router.post('/:userId/unsuspend', requirePermission('users.suspend'), controller.unsuspendUser);
router.post('/:userId/restrictions', requirePermission('users.restrict'), controller.addRestriction);
router.delete('/:userId/restrictions/:restrictionId', requirePermission('users.restrict'), controller.removeRestriction);

router.post('/:userId/logout-all', requirePermission('users.restrict'), controller.logoutAllSessions);
router.post('/:userId/deactivate', requirePermission('users.delete'), controller.deactivateUser);
router.post('/:userId/notes', requirePermission('users.warn'), controller.addNote);

module.exports = router;
