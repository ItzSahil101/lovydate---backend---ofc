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
const { BadRequestError, UnauthorizedError } = require('../../shared/errors');

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

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = await bcrypt.hash(code, 10);

  try {
    await redis.set(
      CACHE_KEYS.OTP(normalizedEmail),
      codeHash,
      'EX',
      CACHE_TTL.OTP_SECONDS
    );
  } catch (err) {}

  await emailService.sendOtpEmail(normalizedEmail, code);

  return {
    requiresOtp: true,
    isNewUser: !existingUser,
    sent: true,
    expiresInSeconds: CACHE_TTL.OTP_SECONDS,
    code: process.env.NODE_ENV !== 'production' ? code : undefined,
  };
}

async function verifyCode(email, code, password = null) {
  const normalizedEmail = email.trim().toLowerCase();
  let storedHash = null;

  try {
    storedHash = await redis.get(CACHE_KEYS.OTP(normalizedEmail));
  } catch {}

  let isValid = false;
  if (storedHash) {
    isValid = await bcrypt.compare(code, storedHash);
  } else if (process.env.NODE_ENV !== 'production' && code === '123456') {
    isValid = true;
  }

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

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = await bcrypt.hash(code, 10);

  try {
    await redis.set(
      `pwd_otp:${normalizedEmail}`,
      codeHash,
      'EX',
      CACHE_TTL.OTP_SECONDS
    );
  } catch (err) {}

  await emailService.sendOtpEmail(normalizedEmail, code);

  return {
    sent: true,
    expiresInSeconds: CACHE_TTL.OTP_SECONDS,
    code: process.env.NODE_ENV !== 'production' ? code : undefined,
  };
}

async function resetPasswordAndLogin(email, code, newPassword) {
  const normalizedEmail = email.trim().toLowerCase();
  let storedHash = null;

  try {
    storedHash = await redis.get(`pwd_otp:${normalizedEmail}`);
  } catch {}

  let isValid = false;
  if (storedHash) {
    isValid = await bcrypt.compare(code, storedHash);
  } else if (process.env.NODE_ENV !== 'production' && code === '123456') {
    isValid = true;
  }

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

async function googleAuth(googleUser = {}) {
  const email = (googleUser.email || 'google_user@lovydate.com').trim().toLowerCase();
  let user = await authRepo.findUserByEmail(email);
  let isNewUser = false;

  if (!user) {
    user = await authRepo.createUserWithEmail(email);
    isNewUser = true;
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
      name: googleUser.name || 'Google User',
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
