const express = require('express');
const { requireAdminAuth, requirePermission } = require('../middleware/adminAuth');
const controller = require('./adminJobs.controller');

const router = express.Router();

router.use(requireAdminAuth);

router.get('/', requirePermission('jobs.read'), controller.listQueues);
router.get('/:queueName', requirePermission('jobs.read'), controller.getQueueDetails);
router.post('/:queueName/:jobId/retry', requirePermission('jobs.retry'), controller.retryJob);
router.delete('/:queueName/:jobId', requirePermission('jobs.retry'), controller.removeJob);

module.exports = router;
