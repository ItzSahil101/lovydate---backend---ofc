const express = require('express');
const multer = require('multer');
const router = express.Router();
const mediaController = require('./media.controller');
const { requireAuth } = require('../../middleware/auth');
const { rateLimiter } = require('../../middleware/rateLimiter');
const { BadRequestError } = require('../../shared/errors');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new BadRequestError('Only JPEG, PNG, and WEBP images are supported', 'INVALID_FILE_TYPE'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

router.get('/file/:key', mediaController.getMediaFile);
router.get('/:key', mediaController.getMediaFile);

router.post(
  '/upload',
  rateLimiter({ action: 'media-upload', max: 30, windowSeconds: 60 }),
  upload.single('photo'),
  mediaController.uploadSingle
);

router.post(
  '/upload-multiple',
  rateLimiter({ action: 'media-upload-batch', max: 15, windowSeconds: 60 }),
  upload.array('photos', 6),
  mediaController.uploadMultiple
);

module.exports = router;
