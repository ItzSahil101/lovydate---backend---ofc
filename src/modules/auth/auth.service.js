const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const { CACHE_KEYS, CACHE_TTL } = require('../../config/constants');
const redis = require('../../infrastructure/redis/client');
const { addJob } = require('../../infrastructure/queue/queueManager');
const { QUEUE_NAMES } = require('../../config/constants');
const authRepo = require('./auth.repository');
const emailService = require('../../infrastructure/email/emailService');
const { AppError, BadRequestError, UnauthorizedError } = require('../../shared/errors');
const { verifyFirebaseIdToken } = require('../../infrastructure/firebase/fcm');

function createOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

async function storeOtp(key, codeHash) {
  try {
    await redis.set(key, codeHash, 'EX', CACHE_TTL.OTP_SECONDS);
  } catch (err) {
    throw new AppError('Verification service is temporarily unavailable', 503, 'VERIFICATION_UNAVAILABLE');
  }
}

async function readOtp(key) {
  try {
    return await redis.get(key);
  } catch (err) {
    throw new AppError('Verification service is temporarily unavailable', 503, 'VERIFICATION_UNAVAILABLE');
  }
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function generateTokens(user) {
  const accessToken = jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    env.jwt.secret,
    { expiresIn: env.jwt.expiresIn }
  );

  const rawRefreshToken = crypto.randomBytes(40).toString('hex');
  const tokenHash = hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    tokenHash,
    expiresAt,
  };
}

async function requestCode(email, password = null) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await authRepo.findUserByEmail(normalizedEmail);

  if (existingUser && existingUser.password_hash && password) {
    const isPasswordValid = await bcrypt.compare(password, existingUser.password_hash);
    if (!isPasswordValid) {
      throw new BadRequestError('Invalid email or password', 'INVALID_CREDENTIALS');
    }
    if (existingUser.status !== 'active') {
      throw new UnauthorizedError('User account is not active', 'ACCOUNT_INACTIVE');
    }

    const tokens = generateTokens(existingUser);
    await authRepo.storeRefreshToken(existingUser.id, tokens.tokenHash, tokens.expiresAt);
    addJob(QUEUE_NAMES.LOGIN_WARMUP, 'warmup', { userId: existingUser.id }).catch(() => {});

    return {
      requiresOtp: false,
      isNewUser: false,
      user: {
        id: existingUser.id,
        email: existingUser.email,
        status: existingUser.status,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  const code = createOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const otpKey = CACHE_KEYS.OTP(normalizedEmail);
  await storeOtp(otpKey, codeHash);
  try {
    await emailService.sendOtpEmail(normalizedEmail, code);
  } catch (err) {
    await redis.del(otpKey).catch(() => {});
    throw new AppError('Verification email could not be sent', 503, 'EMAIL_DELIVERY_FAILED');
  }

  return {
    requiresOtp: true,
    isNewUser: !existingUser,
    sent: true,
    expiresInSeconds: CACHE_TTL.OTP_SECONDS,
  };
}

async function verifyCode(email, code, password = null) {
  const normalizedEmail = email.trim().toLowerCase();
  const storedHash = await readOtp(CACHE_KEYS.OTP(normalizedEmail));
  const isValid = storedHash ? await bcrypt.compare(code, storedHash) : false;

  if (!isValid) {
    throw new BadRequestError('Invalid or expired verification code', 'INVALID_OTP');
  }

  try {
    await redis.del(CACHE_KEYS.OTP(normalizedEmail));
  } catch {}

  let user = await authRepo.findUserByEmail(normalizedEmail);
  let isNewUser = false;

  if (!user) {
    let passwordHash = null;
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
    user = await authRepo.createUser({
      email: normalizedEmail,
      passwordHash,
      verified: true,
    });
    isNewUser = true;
  } else {
    if (user.status !== 'active') {
      throw new UnauthorizedError('User account is not active', 'ACCOUNT_INACTIVE');
    }
    if (!user.email_verified_at) {
      await authRepo.markEmailVerified(user.id);
    }
    if (password && !user.password_hash) {
      const newHash = await bcrypt.hash(password, 10);
      await authRepo.updatePassword(user.id, newHash);
    }
  }

  const tokens = generateTokens(user);
  await authRepo.storeRefreshToken(user.id, tokens.tokenHash, tokens.expiresAt);

  addJob(QUEUE_NAMES.LOGIN_WARMUP, 'warmup', { userId: user.id }).catch(() => {});

  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
    },
    isNewUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function requestPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await authRepo.findUserByEmail(normalizedEmail);
  if (!existingUser) {
    throw new BadRequestError('No account found with this email address', 'USER_NOT_FOUND');
  }

  const code = createOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const otpKey = `pwd_otp:${normalizedEmail}`;
  await storeOtp(otpKey, codeHash);
  try {
    await emailService.sendOtpEmail(normalizedEmail, code);
  } catch (err) {
    await redis.del(otpKey).catch(() => {});
    throw new AppError('Verification email could not be sent', 503, 'EMAIL_DELIVERY_FAILED');
  }

  return {
    sent: true,
    expiresInSeconds: CACHE_TTL.OTP_SECONDS,
  };
}

async function resetPasswordAndLogin(email, code, newPassword) {
  const normalizedEmail = email.trim().toLowerCase();
  const storedHash = await readOtp(`pwd_otp:${normalizedEmail}`);
  const isValid = storedHash ? await bcrypt.compare(code, storedHash) : false;

  if (!isValid) {
    throw new BadRequestError('Invalid or expired verification code', 'INVALID_OTP');
  }

  try {
    await redis.del(`pwd_otp:${normalizedEmail}`);
  } catch {}

  const user = await authRepo.findUserByEmail(normalizedEmail);
  if (!user) {
    throw new BadRequestError('No account found with this email address', 'USER_NOT_FOUND');
  }
  if (user.status !== 'active') {
    throw new UnauthorizedError('User account is not active', 'ACCOUNT_INACTIVE');
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await authRepo.updatePassword(user.id, passwordHash);

  const tokens = generateTokens(user);
  await authRepo.storeRefreshToken(user.id, tokens.tokenHash, tokens.expiresAt);

  addJob(QUEUE_NAMES.LOGIN_WARMUP, 'warmup', { userId: user.id }).catch(() => {});

  return {
    user: {
      id: user.id,
      email: user.email,
      status: user.status,
    },
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    message: 'Password reset successfully',
  };
}

async function refreshToken(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw new UnauthorizedError('Refresh token is required');
  }

  const tokenHash = hashToken(rawRefreshToken);
  const existingToken = await authRepo.findRefreshToken(tokenHash);

  if (!existingToken) {
    throw new UnauthorizedError('Invalid or expired refresh token');
  }

  const user = await authRepo.findUserById(existingToken.user_id);
  if (!user || user.status !== 'active') {
    await authRepo.deleteRefreshToken(tokenHash);
    throw new UnauthorizedError('User is no longer active');
  }

  await authRepo.deleteRefreshToken(tokenHash);

  const tokens = generateTokens(user);
  await authRepo.storeRefreshToken(user.id, tokens.tokenHash, tokens.expiresAt);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  };
}

async function logout(rawRefreshToken, userId) {
  if (rawRefreshToken) {
    const tokenHash = hashToken(rawRefreshToken);
    await authRepo.deleteRefreshToken(tokenHash);
  } else if (userId) {
    await authRepo.deleteUserRefreshTokens(userId);
  }
  return { loggedOut: true };
}

async function googleAuth(idToken) {
  let googleUser;
  try {
    googleUser = await verifyFirebaseIdToken(idToken);
  } catch (err) {
    throw new UnauthorizedError('Invalid Google identity token', 'INVALID_GOOGLE_TOKEN');
  }
  if (googleUser.firebase?.sign_in_provider !== 'google.com') {
    throw new UnauthorizedError('Identity token was not issued by Google sign in', 'INVALID_GOOGLE_PROVIDER');
  }
  if (!googleUser.email || googleUser.email_verified === false) {
    throw new UnauthorizedError('Google account email is not verified', 'UNVERIFIED_GOOGLE_EMAIL');
  }
  const email = googleUser.email.trim().toLowerCase();
  let user = await authRepo.findUserByEmail(email);
  let isNewUser = false;

  if (!user) {
    user = await authRepo.createGoogleUser({ email, googleId: googleUser.uid });
    isNewUser = true;
  } else if (!user.google_id) {
    user = await authRepo.linkGoogleIdentity(user.id, googleUser.uid);
  } else if (user.google_id !== googleUser.uid) {
    throw new UnauthorizedError('Google identity does not match this account', 'GOOGLE_IDENTITY_MISMATCH');
  }
  if (user.status !== 'active') {
    throw new UnauthorizedError('User account is not active', 'ACCOUNT_INACTIVE');
  }

  const tokens = generateTokens(user);
  await authRepo.storeRefreshToken(user.id, tokens.tokenHash, tokens.expiresAt);

  return {
    isNewUser,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: googleUser.name || null,
    },
  };
}

module.exports = {
  requestCode,
  verifyCode,
  requestPasswordReset,
  resetPasswordAndLogin,
  refreshToken,
  logout,
  googleAuth,
};
