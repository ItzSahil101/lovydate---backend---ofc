const jobsService = require('./adminJobs.service');

async function listQueues(req, res, next) {
  try {
    const result = await jobsService.listQueues();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getQueueDetails(req, res, next) {
  try {
    const { queueName } = req.params;
    const result = await jobsService.getQueueDetails(queueName);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function retryJob(req, res, next) {
  try {
    const { queueName, jobId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await jobsService.retryJob(queueName, jobId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function removeJob(req, res, next) {
  try {
    const { queueName, jobId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await jobsService.removeJob(queueName, jobId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listQueues,
  getQueueDetails,
  retryJob,
  removeJob,
};
