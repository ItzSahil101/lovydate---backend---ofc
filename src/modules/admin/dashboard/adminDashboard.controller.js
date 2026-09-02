const dashboardService = require('./adminDashboard.service');

async function getSummary(req, res, next) {
  try {
    const { range } = req.query;
    const result = await dashboardService.getSummary(range);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getLiveActivity(req, res, next) {
  try {
    const result = await dashboardService.getLiveActivity();
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getChart(req, res, next) {
  try {
    const { period } = req.query;
    const result = await dashboardService.getChart(period);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getActivity(req, res, next) {
  try {
    const { limit } = req.query;
    const result = await dashboardService.getActivity(limit ? parseInt(limit, 10) : 10);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSummary,
  getLiveActivity,
  getChart,
  getActivity,
};
