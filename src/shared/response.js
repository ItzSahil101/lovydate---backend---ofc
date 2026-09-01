function success(res, data, statusCode = 200) {
  return res.status(statusCode).json({
    data,
  });
}

function paginated(res, items, nextCursor, hasMore, statusCode = 200) {
  return res.status(statusCode).json({
    items,
    nextCursor: nextCursor || null,
    hasMore: Boolean(hasMore),
  });
}

module.exports = {
  success,
  paginated,
};
