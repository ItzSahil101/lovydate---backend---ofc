const { AppError } = require('../shared/errors');
const multer = require('multer');

function errorHandler(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    const isTooLarge = err.code === 'LIMIT_FILE_SIZE';
    return res.status(isTooLarge ? 413 : 400).json({
      error: {
        code: isTooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
        message: isTooLarge
          ? 'The uploaded file exceeds the allowed size'
          : err.message,
      },
    });
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
      },
    });
  }

  console.error('Unhandled Server Error:', err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred. Please try again later.',
    },
  });
}

module.exports = { errorHandler };
