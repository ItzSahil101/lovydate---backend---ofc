const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminRoles.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('roles.read'), controller.listRoles);
router.post('/', requirePermission('roles.manage'), controller.createRole);
router.get('/:roleId', requirePermission('roles.read'), controller.getRoleDetail);
router.patch('/:roleId', requirePermission('roles.manage'), controller.updateRole);

module.exports = router;
