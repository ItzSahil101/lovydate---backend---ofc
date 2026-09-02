const segmentsService = require('./adminSegments.service');

async function listSegments(req, res, next) {
  try {
    const result = await segmentsService.listSegments();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getSegmentDetail(req, res, next) {
  try {
    const { segmentId } = req.params;
    const result = await segmentsService.getSegmentDetail(segmentId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createSegment(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await segmentsService.createSegment(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateSegment(req, res, next) {
  try {
    const { segmentId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await segmentsService.updateSegment(segmentId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function deleteSegment(req, res, next) {
  try {
    const { segmentId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await segmentsService.deleteSegment(segmentId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function estimateSegment(req, res, next) {
  try {
    const result = await segmentsService.estimateSegment(req.body.filters);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listSegments,
  getSegmentDetail,
  createSegment,
  updateSegment,
  deleteSegment,
  estimateSegment,
};
