const analyticsService = require('./adminAnalytics.service');

async function getOverview(req, res, next) {
  try {
    const result = await analyticsService.getOverview(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getGrowth(req, res, next) {
  try {
    const result = await analyticsService.getGrowth(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getFunnel(req, res, next) {
  try {
    const result = await analyticsService.getFunnel(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getDiscovery(req, res, next) {
  try {
    const result = await analyticsService.getDiscovery(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getMatches(req, res, next) {
  try {
    const result = await analyticsService.getMatches(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getChat(req, res, next) {
  try {
    const result = await analyticsService.getChat(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getFeed(req, res, next) {
  try {
    const result = await analyticsService.getFeed(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getRetention(req, res, next) {
  try {
    const result = await analyticsService.getRetention(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getModeration(req, res, next) {
  try {
    const result = await analyticsService.getModeration(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getNotifications(req, res, next) {
  try {
    const result = await analyticsService.getNotifications(req.query.range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getOverview,
  getGrowth,
  getFunnel,
  getDiscovery,
  getMatches,
  getChat,
  getFeed,
  getRetention,
  getModeration,
  getNotifications,
};
