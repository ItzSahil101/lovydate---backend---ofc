const express = require('express');
const router = express.Router();
const authController = require('./auth.controller');
const { validate } = require('../../middleware/validate');
const { rateLimiter } = require('../../middleware/rateLimiter');
const {
  requestCodeSchema,
  verifyCodeSchema,
  refreshSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
} = require('./auth.validation');

router.post(
  '/email/request-code',
  rateLimiter({ action: 'otp-request', max: 5, windowSeconds: 60 }),
  validate(requestCodeSchema),
  authController.requestCode
);

router.post(
  '/email/verify-code',
  rateLimiter({ action: 'otp-verify', max: 10, windowSeconds: 60 }),
  validate(verifyCodeSchema),
  authController.verifyCode
);

router.post(
  '/forgot-password/request',
  rateLimiter({ action: 'forgot-pwd-req', max: 5, windowSeconds: 60 }),
  validate(forgotPasswordRequestSchema),
  authController.requestPasswordReset
);

router.post(
  '/forgot-password/reset',
  rateLimiter({ action: 'forgot-pwd-reset', max: 10, windowSeconds: 60 }),
  validate(forgotPasswordResetSchema),
  authController.resetPassword
);

router.post(
  '/refresh',
  rateLimiter({ action: 'token-refresh', max: 30, windowSeconds: 60 }),
  validate(refreshSchema),
  authController.refreshToken
);

router.post(
  '/logout',
  authController.logout
);

module.exports = router;
