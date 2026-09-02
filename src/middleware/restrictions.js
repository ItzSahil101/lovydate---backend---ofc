const { query } = require('../infrastructure/database/pool');
const { ForbiddenError } = require('../shared/errors');

const ACCOUNT_SUSPENSION = 'ACCOUNT_SUSPENSION';

async function expireStaleRestrictions(userId) {
  await query(
    `UPDATE user_restrictions
     SET is_active = FALSE, updated_at = NOW()
     WHERE user_id = $1
       AND is_active = TRUE
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`,
    [userId]
  );

  await query(
    `UPDATE users
     SET status = 'active', updated_at = NOW()
     WHERE id = $1
       AND status = 'suspended'
       AND NOT EXISTS (
         SELECT 1
         FROM user_restrictions
         WHERE user_id = $1
           AND restriction_type = $2
           AND is_active = TRUE
           AND (expires_at IS NULL OR expires_at > NOW())
       )`,
    [userId, ACCOUNT_SUSPENSION]
  );
}

async function getActiveRestriction(userId, restrictionType) {
  await expireStaleRestrictions(userId);

  const result = await query(
    `SELECT restriction_type AS "restrictionType", reason,
            expires_at AS "expiresAt"
     FROM user_restrictions
     WHERE user_id = $1
       AND restriction_type = ANY($2::varchar[])
       AND is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
     ORDER BY
       CASE WHEN restriction_type = $3 THEN 0 ELSE 1 END,
       created_at DESC
     LIMIT 1`,
    [userId, [ACCOUNT_SUSPENSION, restrictionType], ACCOUNT_SUSPENSION]
  );

  return result.rows[0] || null;
}

async function assertNoRestriction(userId, restrictionType) {
  const restriction = await getActiveRestriction(userId, restrictionType);
  if (!restriction) return;

  const isSuspended = restriction.restrictionType === ACCOUNT_SUSPENSION;
  const message = isSuspended
    ? `Your account is suspended${restriction.reason ? `: ${restriction.reason}` : ''}`
    : `This action is disabled for your account${restriction.reason ? `: ${restriction.reason}` : ''}`;

  throw new ForbiddenError(
    message,
    isSuspended ? 'ACCOUNT_SUSPENDED' : restriction.restrictionType
  );
}

function requireNoRestriction(restrictionType) {
  return async (req, res, next) => {
    try {
      await assertNoRestriction(req.user.userId, restrictionType);
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  ACCOUNT_SUSPENSION,
  expireStaleRestrictions,
  getActiveRestriction,
  assertNoRestriction,
  requireNoRestriction,
};
