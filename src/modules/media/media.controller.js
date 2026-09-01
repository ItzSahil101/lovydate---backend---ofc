const { getPhotoUrl } = require('./media.service');
const { success } = require('../../shared/response');
const { BadRequestError } = require('../../shared/errors');

async function uploadSingle(req, res, next) {
  try {
    if (!req.file) {
      throw new BadRequestError('No image file provided', 'FILE_REQUIRED');
    }
    const url = getPhotoUrl(req, req.file.filename);
    return success(res, {
      url,
      filename: req.file.filename,
      size: req.file.size,
      mimetype: req.file.mimetype,
    }, 201);
  } catch (err) {
    next(err);
  }
}

async function uploadMultiple(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      throw new BadRequestError('No image files provided', 'FILES_REQUIRED');
    }
    const photos = req.files.map((file) => ({
      url: getPhotoUrl(req, file.filename),
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype,
    }));
    return success(res, { photos }, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadSingle,
  uploadMultiple,
};
