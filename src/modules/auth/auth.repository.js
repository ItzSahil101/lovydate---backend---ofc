const { query } = require('../../infrastructure/database/pool');

async function findUserByEmail(email) {
  const res = await query(
    `SELECT id, email, password_hash, google_id, email_verified_at, status, created_at
     FROM users
     WHERE LOWER(email) = $1`,
    [email.toLowerCase().trim()]
  );
  return res.rows[0] || null;
}

async function findUserById(userId) {
  const res = await query(
    `SELECT id, email, password_hash, google_id, email_verified_at, status, created_at
     FROM users
     WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

async function createUser({ email, passwordHash = null, verified = false }) {
  const normalizedEmail = email.toLowerCase().trim();
  const userRes = await query(
    `INSERT INTO users (email, password_hash, email_verified_at, status)
     VALUES ($1, $2, $3, 'active')
     RETURNING id, email, password_hash, status, created_at`,
    [normalizedEmail, passwordHash, verified ? new Date() : null]
  );
  return userRes.rows[0];
}

async function markEmailVerified(userId) {
  await query(
    `UPDATE users
     SET email_verified_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [userId]
  );
}

async function updatePassword(userId, passwordHash) {
  await query(
    `UPDATE users
     SET password_hash = $1, updated_at = NOW()
     WHERE id = $2`,
    [passwordHash, userId]
  );
}

async function storeRefreshToken(userId, tokenHash, expiresAt) {
  await query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [userId, tokenHash, expiresAt]
  );
}

async function findRefreshToken(tokenHash) {
  const res = await query(
    `SELECT id, user_id, token_hash, expires_at
     FROM refresh_tokens
     WHERE token_hash = $1 AND expires_at > NOW()`,
    [tokenHash]
  );
  return res.rows[0] || null;
}

async function deleteRefreshToken(tokenHash) {
  await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
}

async function deleteUserRefreshTokens(userId) {
  await query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  markEmailVerified,
  updatePassword,
  storeRefreshToken,
  findRefreshToken,
  deleteRefreshToken,
  deleteUserRefreshTokens,
};
