const contentService = require('./adminContent.service');

async function listFeed(req, res, next) {
  try {
    const result = await contentService.listFeed(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listPhotos(req, res, next) {
  try {
    const result = await contentService.listPhotos(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listComments(req, res, next) {
  try {
    const result = await contentService.listComments(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function listProfiles(req, res, next) {
  try {
    const result = await contentService.listProfiles(req.query);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function removeContent(req, res, next) {
  try {
    const { contentType, contentId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await contentService.removeContent({ contentType, contentId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function restoreContent(req, res, next) {
  try {
    const { contentType, contentId } = req.params;
    const { reason } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await contentService.restoreContent({ contentType, contentId, reason, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

async function approvePhoto(req, res, next) {
  try {
    const { photoId } = req.params;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const result = await contentService.approvePhoto({ photoId, admin: req.admin, ipAddress });
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listFeed,
  listPhotos,
  listComments,
  listProfiles,
  removeContent,
  restoreContent,
  approvePhoto,
};
