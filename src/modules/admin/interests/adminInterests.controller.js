const interestsService = require('./adminInterests.service');

async function listInterests(req, res, next) {
  try {
    const result = await interestsService.listInterests();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getInterestDetail(req, res, next) {
  try {
    const { interestId } = req.params;
    const result = await interestsService.getInterestDetail(interestId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function createInterest(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await interestsService.createInterest(req.body, req.admin, ipAddress);
    res.status(201).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function updateInterest(req, res, next) {
  try {
    const { interestId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await interestsService.updateInterest(interestId, req.body, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function enableInterest(req, res, next) {
  try {
    const { interestId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await interestsService.enableInterest(interestId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function disableInterest(req, res, next) {
  try {
    const { interestId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await interestsService.disableInterest(interestId, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function reorderInterests(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await interestsService.reorderInterests(req.body.items, req.admin, ipAddress);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInterests,
  getInterestDetail,
  createInterest,
  updateInterest,
  enableInterest,
  disableInterest,
  reorderInterests,
};
