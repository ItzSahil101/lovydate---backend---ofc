const { query, withTransaction } = require('../../infrastructure/database/pool');

async function insertPass(sourceUserId, targetUserId) {
  await query(
    `INSERT INTO passes (source_user_id, target_user_id)
     VALUES ($1, $2)
     ON CONFLICT (source_user_id, target_user_id) DO NOTHING`,
    [sourceUserId, targetUserId]
  );
  return { passed: true };
}

async function recordLikeAndCheckMatch(sourceUserId, targetUserId) {
  return withTransaction(async (client) => {
    await client.query(
      `INSERT INTO likes (source_user_id, target_user_id)
       VALUES ($1, $2)
       ON CONFLICT (source_user_id, target_user_id) DO NOTHING`,
      [sourceUserId, targetUserId]
    );

    const reverseLikeRes = await client.query(
      `SELECT id FROM likes
       WHERE source_user_id = $1 AND target_user_id = $2`,
      [targetUserId, sourceUserId]
    );

    if (reverseLikeRes.rows.length === 0) {
      return {
        liked: true,
        isMatch: false,
        match: null,
      };
    }

    const userOneId = sourceUserId < targetUserId ? sourceUserId : targetUserId;
    const userTwoId = sourceUserId < targetUserId ? targetUserId : sourceUserId;

    const matchRes = await client.query(
      `INSERT INTO matches (user_one_id, user_two_id)
       VALUES ($1, $2)
       ON CONFLICT (user_one_id, user_two_id) DO UPDATE SET created_at = matches.created_at
       RETURNING id, user_one_id AS "userOneId", user_two_id AS "userTwoId", created_at AS "createdAt"`,
      [userOneId, userTwoId]
    );
    const match = matchRes.rows[0];

    const convRes = await client.query(
      `INSERT INTO conversations (match_id)
       VALUES ($1)
       ON CONFLICT (match_id) DO UPDATE SET updated_at = NOW()
       RETURNING id, match_id AS "matchId", created_at AS "createdAt"`,
      [match.id]
    );
    const conversation = convRes.rows[0];

    await client.query(
      `INSERT INTO conversation_members (conversation_id, user_id)
       VALUES ($1, $2), ($1, $3)
       ON CONFLICT (conversation_id, user_id) DO NOTHING`,
      [conversation.id, userOneId, userTwoId]
    );

    return {
      liked: true,
      isMatch: true,
      match: {
        id: match.id,
        conversationId: conversation.id,
        createdAt: match.createdAt,
      },
    };
  });
}

async function checkLikeAndMatchStatus(sourceUserId, targetUserId) {
  const likeRes = await query(
    `SELECT 1 FROM likes WHERE source_user_id = $1 AND target_user_id = $2`,
    [sourceUserId, targetUserId]
  );
  const isLiked = likeRes.rows.length > 0;

  const userOneId = sourceUserId < targetUserId ? sourceUserId : targetUserId;
  const userTwoId = sourceUserId < targetUserId ? targetUserId : sourceUserId;

  const matchRes = await query(
    `SELECT m.id AS "matchId", c.id AS "conversationId"
     FROM matches m
     LEFT JOIN conversations c ON c.match_id = m.id
     WHERE m.user_one_id = $1 AND m.user_two_id = $2`,
    [userOneId, userTwoId]
  );

  const isMatch = matchRes.rows.length > 0;
  const conversationId = isMatch ? matchRes.rows[0].conversationId : null;
  const matchId = isMatch ? matchRes.rows[0].matchId : null;

  return {
    isLiked,
    isMatch,
    matchId,
    conversationId,
  };
}

async function unlikeUser(sourceUserId, targetUserId) {
  await query(
    `DELETE FROM likes WHERE source_user_id = $1 AND target_user_id = $2`,
    [sourceUserId, targetUserId]
  );
  return { unliked: true };
}

module.exports = {
  insertPass,
  recordLikeAndCheckMatch,
  checkLikeAndMatchStatus,
  unlikeUser,
};
