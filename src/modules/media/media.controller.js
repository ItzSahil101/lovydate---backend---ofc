const { uploadFileToS3 } = require('./media.service');
const { success } = require('../../shared/response');
const { BadRequestError } = require('../../shared/errors');

async function uploadSingle(req, res, next) {
  try {
    if (!req.file) {
      throw new BadRequestError('No image file provided', 'FILE_REQUIRED');
    }
    const uploaded = await uploadFileToS3(req.file);
    return success(res, {
      url: uploaded.url,
      filename: uploaded.key,
      size: uploaded.size,
      mimetype: uploaded.mimetype,
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
    const photos = await Promise.all(
      req.files.map((file) => uploadFileToS3(file))
    );
    return success(
      res,
      {
        photos: photos.map((p) => ({
          url: p.url,
          filename: p.key,
          size: p.size,
          mimetype: p.mimetype,
        })),
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  uploadSingle,
  uploadMultiple,
};
