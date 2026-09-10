const {
  uploadFileToS3,
  getFileFromS3,
  getMediaKind,
  readMp4DurationSeconds,
} = require('./media.service');
const { success } = require('../../shared/response');
const { AppError, BadRequestError } = require('../../shared/errors');

async function getMediaFile(req, res, next) {
  try {
    const { key } = req.params;
    if (!key || key.includes('..') || key.includes('/') || key.includes('\\')) {
      return res.status(400).json({ error: { code: 'INVALID_KEY', message: 'Invalid media key' } });
    }

    try {
      const { stream, contentType, contentLength, eTag, lastModified } = await getFileFromS3(key);

      if (eTag) res.setHeader('ETag', eTag);
      if (lastModified) res.setHeader('Last-Modified', new Date(lastModified).toUTCString());

      if (req.headers['if-none-match'] && req.headers['if-none-match'] === eTag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', contentType || 'image/jpeg');
      if (contentLength) res.setHeader('Content-Length', contentLength);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');

      return stream.pipe(res);
    } catch (s3Err) {
      if (s3Err.name === 'NoSuchKey' || s3Err.name === 'NotFound' || s3Err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Media not found' } });
      }
      if (s3Err instanceof AppError) throw s3Err;
      console.error(`[MediaController] Could not read ${key} from S3:`, s3Err.message);
      throw new AppError(
        'Media storage is temporarily unavailable. Please try again.',
        503,
        'MEDIA_STORAGE_UNAVAILABLE'
      );
    }
  } catch (err) {
    next(err);
  }
}

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

async function uploadChatMedia(req, res, next) {
  try {
    if (!req.file) {
      throw new BadRequestError('No chat media file provided', 'FILE_REQUIRED');
    }

    const kind = getMediaKind(req.file.mimetype);
    let durationSeconds = Number(req.body.durationSeconds || 0);

    if (kind === 'video') {
      durationSeconds = readMp4DurationSeconds(req.file.buffer);
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        throw new BadRequestError(
          'Could not read the video duration. Please choose another MP4 or MOV file.',
          'INVALID_VIDEO'
        );
      }
      if (durationSeconds > 90) {
        throw new BadRequestError(
          'Videos must be 1 minute 30 seconds or shorter',
          'VIDEO_TOO_LONG'
        );
      }
    }

    const uploaded = await uploadFileToS3(req.file);
    return success(res, {
      url: uploaded.url,
      filename: uploaded.key,
      size: uploaded.size,
      mimetype: uploaded.mimetype,
      kind,
      durationSeconds: durationSeconds > 0 ? Math.ceil(durationSeconds) : null,
    }, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getMediaFile,
  uploadSingle,
  uploadMultiple,
  uploadChatMedia,
};
