const { query, withTransaction } = require('../../infrastructure/database/pool');

async function getAnswers(userId) {
  const result = await query(
    `SELECT question_id AS "questionId",
            selected_option AS "selectedOption"
     FROM user_compatibility_answers
     WHERE user_id = $1
     ORDER BY question_id`,
    [userId]
  );
  return result.rows;
}

async function saveAnswers(userId, answers) {
  await withTransaction(async (client) => {
    for (const answer of answers) {
      await client.query(
        `INSERT INTO user_compatibility_answers
          (user_id, question_id, selected_option, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (user_id, question_id)
         DO UPDATE SET
           selected_option = EXCLUDED.selected_option,
           updated_at = NOW()`,
        [userId, answer.questionId, answer.selectedOption]
      );
    }
  });
}

async function isProfileVisible(userId) {
  const result = await query(
    `SELECT 1
     FROM profiles p
     JOIN users u ON u.id = p.user_id
     LEFT JOIN user_preferences up ON up.user_id = p.user_id
     WHERE p.user_id = $1
       AND p.onboarding_completed = TRUE
       AND u.status = 'active'
       AND COALESCE(up.is_incognito, FALSE) = FALSE`,
    [userId]
  );
  return result.rows.length > 0;
}

async function getComparisonData(userIds) {
  if (!userIds || userIds.length === 0) return {};

  const [profilesResult, answersResult, interestsResult] = await Promise.all([
    query(
      `SELECT p.user_id AS "userId",
              p.relationship_goal AS "relationshipGoal",
              p.bio,
              p.occupation,
              p.pets
       FROM profiles p
       JOIN users u ON u.id = p.user_id AND u.status = 'active'
       WHERE p.user_id = ANY($1::uuid[])
         AND p.onboarding_completed = TRUE`,
      [userIds]
    ),
    query(
      `SELECT user_id AS "userId",
              question_id AS "questionId",
              selected_option AS "selectedOption"
       FROM user_compatibility_answers
       WHERE user_id = ANY($1::uuid[])
       ORDER BY question_id`,
      [userIds]
    ),
    query(
      `SELECT ui.user_id AS "userId", i.name
       FROM user_interests ui
       JOIN interests i ON i.id = ui.interest_id
       WHERE ui.user_id = ANY($1::uuid[])`,
      [userIds]
    ),
  ]);

  const data = {};

  for (const id of userIds) {
    data[id] = { profile: null, answers: [], interests: [] };
  }

  for (const profile of profilesResult.rows) {
    if (data[profile.userId]) data[profile.userId].profile = profile;
  }

  for (const answer of answersResult.rows) {
    if (data[answer.userId]) data[answer.userId].answers.push(answer);
  }

  for (const interest of interestsResult.rows) {
    if (data[interest.userId]) data[interest.userId].interests.push(interest.name);
  }

  return data;
}

module.exports = {
  getAnswers,
  saveAnswers,
  isProfileVisible,
  getComparisonData,
};
