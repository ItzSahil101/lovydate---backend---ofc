const feedService = require('./adminFeed.service');

async function listFeed(req, res, next) {
  try {
    const result = await feedService.listFeed(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function getPostDetail(req, res, next) {
  try {
    const { postId } = req.params;
    const result = await feedService.getPostDetail(postId);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function removePost(req, res, next) {
  try {
    const { postId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await feedService.removePost({ postId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function restorePost(req, res, next) {
  try {
    const { postId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await feedService.restorePost({ postId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function disableComments(req, res, next) {
  try {
    const { postId } = req.params;
    const { disable = true } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await feedService.disableComments({ postId, disable, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFeed,
  getPostDetail,
  removePost,
  restorePost,
  disableComments,
};
