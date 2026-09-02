const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminAdmins.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('admins.read'), controller.listAdmins);
router.post('/', requirePermission('admins.manage'), controller.createAdmin);
router.get('/:adminId', requirePermission('admins.read'), controller.getAdminDetail);
router.patch('/:adminId', requirePermission('admins.manage'), controller.updateAdmin);
router.post('/:adminId/disable', requirePermission('admins.manage'), controller.disableAdmin);
router.post('/:adminId/enable', requirePermission('admins.manage'), controller.enableAdmin);
router.post('/:adminId/logout-all', requirePermission('admins.manage'), controller.revokeAdminSessions);

module.exports = router;
