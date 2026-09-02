const express = require('express');
const { requireAdminAuth } = require('../middleware/adminAuth');
const controller = require('./adminSearch.controller');

const router = express.Router();

router.use(requireAdminAuth);
router.get('/', controller.search);

module.exports = router;
