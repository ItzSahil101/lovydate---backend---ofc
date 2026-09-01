const matchesRepo = require('./matches.repository');
const { encodeCursor, decodeCursor } = require('../../shared/cursor');
const { NotFoundError } = require('../../shared/errors');

async function getMatches(userId, limit = 20, cursor = null) {
  const clampedLimit = Math.min(Math.max(1, limit), 50);
  const decoded = decodeCursor(cursor);

  const { items, hasMore } = await matchesRepo.getMatchesForUser(
    userId,
    clampedLimit,
    decoded
  );

  let nextCursor = null;
  if (hasMore && items.length > 0) {
    const lastItem = items[items.length - 1];
    nextCursor = encodeCursor({
      createdAt: lastItem.createdAt,
      id: lastItem.id,
    });
  }

  return {
    items,
    nextCursor,
    hasMore,
  };
}

async function getMatch(matchId, userId) {
  const match = await matchesRepo.getMatchById(matchId, userId);
  if (!match) {
    throw new NotFoundError('Match not found', 'MATCH_NOT_FOUND');
  }
  return match;
}

async function getMatchesSummary(userId) {
  return matchesRepo.getMatchesSummary(userId);
}

module.exports = {
  getMatches,
  getMatch,
  getMatchesSummary,
};
