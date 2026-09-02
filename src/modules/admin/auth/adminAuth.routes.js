const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');
const controller = require('./adminAuth.controller');

const router = express.Router();

router.post('/login', controller.login);
router.post('/refresh', controller.refresh);

router.use(requireAdminAuth);
router.post('/logout', controller.logout);
router.post('/logout-all', controller.logoutAll);
router.get('/me', controller.getMe);
router.get('/sessions', controller.getSessions);
router.delete('/sessions/:sessionId', controller.deleteSession);
router.post('/change-password', controller.changePassword);

module.exports = router;
