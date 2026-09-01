const discoveryService = require('./discovery.service');
const { paginated } = require('../../shared/response');

async function getFeed(req, res, next) {
  try {
    const limit = parseInt(req.query.limit || '20', 10);
    const cursor = req.query.cursor || null;

    const filterOverrides = {};
    if (req.query.gender) filterOverrides.gender = req.query.gender;
    if (req.query.minAge) filterOverrides.minAge = req.query.minAge;
    if (req.query.maxAge) filterOverrides.maxAge = req.query.maxAge;
    if (req.query.maxDistanceKm) filterOverrides.maxDistanceKm = req.query.maxDistanceKm;
    if (req.query.relationshipGoal) filterOverrides.relationshipGoal = req.query.relationshipGoal;
    if (req.query.verifiedOnly !== undefined) {
      filterOverrides.verifiedOnly = req.query.verifiedOnly === 'true';
    }

    const result = await discoveryService.getDiscoveryFeed(
      req.user.userId,
      limit,
      cursor,
      Object.keys(filterOverrides).length > 0 ? filterOverrides : null
    );

    return paginated(res, result.items, result.nextCursor, result.hasMore);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getFeed,
};
