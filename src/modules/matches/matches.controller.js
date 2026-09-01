const matchesService = require('./matches.service');
const { paginated, success } = require('../../shared/response');

async function getMatches(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const cursor = req.query.cursor || null;

    const result = await matchesService.getMatches(
      req.user.userId,
      limit,
      cursor
    );

    return paginated(res, result.items, result.nextCursor, result.hasMore);
  } catch (err) {
    next(err);
  }
}

async function getMatchById(req, res, next) {
  try {
    const match = await matchesService.getMatch(req.params.id, req.user.userId);
    return success(res, match);
  } catch (err) {
    next(err);
  }
}

async function getMatchesSummary(req, res, next) {
  try {
    const summary = await matchesService.getMatchesSummary(req.user.userId);
    return success(res, summary);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMatches,
  getMatchById,
  getMatchesSummary,
};
