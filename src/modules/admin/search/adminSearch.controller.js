const searchService = require('./adminSearch.service');

async function search(req, res, next) {
  try {
    const { q, limit } = req.query;
    const result = await searchService.globalSearch(q, limit ? parseInt(limit, 10) : 5);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  search,
};
