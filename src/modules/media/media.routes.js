
const express = require('express');
const multer = require('multer');
const router = express.Router();
const mediaController = require('./media.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { BadRequestError } = require('../../shared/errors');
const { requireNoRestriction } = require('../../middleware/restrictions');

const storage = multer.memoryStorage();

const imageFileTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const chatFileTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'audio/aac',
  'audio/m4a',
  'audio/mp4',
  'audio/mpeg',
  'audio/ogg',
  'audio/wav',
  'audio/x-m4a',
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
]);

const imageFileFilter = (req, file, cb) => {
  if (imageFileTypes.has((file.mimetype || '').toLowerCase())) {
    cb(null, true);
  } else {
    cb(
      new BadRequestError(
        'Only JPEG, PNG, and WEBP images are supported',
        'INVALID_FILE_TYPE'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

const chatUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (chatFileTypes.has((file.mimetype || '').toLowerCase())) {
      cb(null, true);
    } else {
      cb(
        new BadRequestError(
          'Unsupported chat media type',
          'INVALID_FILE_TYPE'
        ),
        false
      );
    }
  },
  limits: {
    fileSize: 50 * 1024 * 1024,
    files: 1,
  },
});

router.get('/file/:key', mediaController.getMediaFile);
router.get('/:key', mediaController.getMediaFile);

router.use(requireAuth);

router.post(
  '/upload',
  rateLimiter({ action: 'media-upload', max: 30, windowSeconds: 60 }),
  upload.single('photo'),
  mediaController.uploadSingle
);

router.post(
  '/feed-upload',
  requireNoRestriction('FEED_POSTING_DISABLED'),
  rateLimiter({ action: 'feed-media-upload', max: 30, windowSeconds: 60 }),
  upload.single('photo'),
  mediaController.uploadSingle
);

router.post(
  '/upload-multiple',
  rateLimiter({ action: 'media-upload-batch', max: 15, windowSeconds: 60 }),
  upload.array('photos', 6),
  mediaController.uploadMultiple
);

router.post(
  '/chat-upload',
  requireNoRestriction('MESSAGING_DISABLED'),
  rateLimiter({ action: 'chat-media-upload', max: 30, windowSeconds: 60 }),
  chatUpload.single('file'),
  mediaController.uploadChatMedia
);

module.exports = router;
