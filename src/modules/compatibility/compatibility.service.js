const compatibilityRepo = require('./compatibility.repository');
const profileRepo = require('../profiles/profile.repository');
const { BadRequestError, NotFoundError } = require('../../shared/errors');
const { isUuid } = require('../../shared/ids');

const questions = [
  { id: 1, question: 'How would you describe yourself?', options: ['Introverted', 'Extroverted', 'Ambivert'] },
  { id: 2, question: 'How do you prefer communicating?', options: ['Texting', 'Voice calls', 'Both'] },
  { id: 3, question: 'What is your ideal weekend?', options: ['Going out', 'Staying home', 'Exploring'] },
  { id: 4, question: 'How do you usually make decisions?', options: ['Logical', 'Emotional', 'A mix'] },
  { id: 5, question: 'What kind of social setting do you prefer?', options: ['Small groups', 'Big groups', 'Depends'] },
  { id: 6, question: 'How do you handle disagreements?', options: ['Talk immediately', 'Take time', 'Find compromise'] },
  { id: 7, question: 'Which activity interests you most?', options: ['Travel', 'Gaming', 'Music', 'Sports', 'Reading'] },
  { id: 8, question: 'What matters most in a connection?', options: ['Trust', 'Humor', 'Communication', 'Understanding'] },
  { id: 9, question: 'Are you more of a planner or spontaneous?', options: ['Planner', 'Spontaneous', 'Both'] },
  { id: 10, question: 'What kind of connection are you looking for?', options: ['Long-term', 'Getting to know someone', 'Friendship'] },
];

const WEIGHTS = {
  questionnaire: 45,
  interests: 25,
  lifestyle: 15,
  bio: 10,
  connectionGoals: 5,
};

async function getQuestions() {
  return questions;
}

async function getMyAnswers(userId) {
  const answers = await compatibilityRepo.getAnswers(userId);
  return {
    answers,
    answeredCount: answers.length,
    totalQuestions: questions.length,
    isComplete: answers.length === questions.length,
  };
}

async function saveMyAnswers(userId, answers) {
  for (const answer of answers) {
    const question = questions.find((item) => item.id === answer.questionId);
    if (!question || !question.options.includes(answer.selectedOption)) {
      throw new BadRequestError(
        `Invalid answer for question ${answer.questionId}`,
        'INVALID_COMPATIBILITY_ANSWER'
      );
    }
  }

  await compatibilityRepo.saveAnswers(userId, answers);
  return getMyAnswers(userId);
}

function normalize(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function percentage(numerator, denominator) {
  return denominator ? Math.round((numerator / denominator) * 100) : 0;
}

function calculateComparison(first, second) {
  const firstAnswers = new Map(first.answers.map((a) => [a.questionId, a.selectedOption]));
  const secondAnswers = new Map(second.answers.map((a) => [a.questionId, a.selectedOption]));

  const matchedAnswers = questions.filter(
    (question) =>
      firstAnswers.get(question.id) === secondAnswers.get(question.id)
  ).length;

  const firstInterests = new Set(first.interests.map(normalize).filter(Boolean));
  const secondInterests = new Set(second.interests.map(normalize).filter(Boolean));

  const sharedInterests = [...firstInterests].filter((item) => secondInterests.has(item));
  const interestUnion = new Set([...firstInterests, ...secondInterests]);

  const interestAvailable = firstInterests.size > 0 && secondInterests.size > 0;
  const interestScore = interestAvailable
    ? percentage(sharedInterests.length, interestUnion.size)
    : null;

  // Occupation is deliberately excluded: having the same job is not
  // necessarily evidence of lifestyle compatibility.
  const firstPets = normalize(first.profile.pets);
  const secondPets = normalize(second.profile.pets);
  const lifestyleAvailable = Boolean(firstPets && secondPets);
  const lifestyleScore = lifestyleAvailable
    ? (firstPets === secondPets ? 100 : 0)
    : null;

  const firstGoal = normalize(first.profile.relationshipGoal);
  const secondGoal = normalize(second.profile.relationshipGoal);
  const goalAvailable = Boolean(firstGoal && secondGoal);
  const goalScore = goalAvailable
    ? (firstGoal === secondGoal ? 100 : 0)
    : null;

  // Bio text is not scored or exposed. Free-text keyword matching can
  // produce misleading results and reveal arbitrary personal information.
  const scores = {
    questionnaire: percentage(matchedAnswers, questions.length),
    interests: interestScore,
    lifestyle: lifestyleScore,
    bio: null,
    connectionGoals: goalScore,
  };

  const availableWeight = Object.entries(scores).reduce(
    (total, [key, score]) => total + (score === null ? 0 : WEIGHTS[key]),
    0
  );

  const weightedScore = Object.entries(scores).reduce(
    (total, [key, score]) =>
      total + (score === null ? 0 : score * WEIGHTS[key]),
    0
  );

  const breakdown = {};

  for (const [key, score] of Object.entries(scores)) {
    const available = score !== null;

    breakdown[key] = {
      score,
      weight: WEIGHTS[key],
      effectiveWeight: available
        ? Math.round((WEIGHTS[key] / availableWeight) * 100)
        : 0,
      available,
    };
  }

  breakdown.questionnaire.matchedCount = matchedAnswers;
  breakdown.questionnaire.totalQuestions = questions.length;

  breakdown.interests.shared = sharedInterests;
  breakdown.interests.sharedCount = sharedInterests.length;

  breakdown.lifestyle.shared = lifestyleAvailable && firstPets === secondPets
    ? ['pets']
    : [];

  breakdown.connectionGoals.sameGoal = goalAvailable && firstGoal === secondGoal;

  return {
    isAvailable: true,
    score: availableWeight
      ? Math.round(weightedScore / availableWeight)
      : null,
    breakdown,
  };
}

function compareFromData(data, firstUserId, secondUserId) {
  const first = data[firstUserId];
  const second = data[secondUserId];

  if (!first || !second || !first.profile || !second.profile) {
    return { isAvailable: false, reason: 'PROFILE_UNAVAILABLE' };
  }

  if (
    first.answers.length !== questions.length ||
    second.answers.length !== questions.length
  ) {
    return {
      isAvailable: false,
      reason: 'QUESTIONNAIRE_INCOMPLETE',
      completed: {
        you: first.answers.length,
        them: second.answers.length,
        total: questions.length,
      },
    };
  }

  return calculateComparison(first, second);
}

async function getScoresForUsers(userId, targetUserIds) {
  const uniqueIds = [...new Set([userId, ...(targetUserIds || [])])];
  if (uniqueIds.length <= 1) return {};

  const data = await compatibilityRepo.getComparisonData(uniqueIds);
  const scores = {};

  for (const targetId of targetUserIds || []) {
    if (targetId !== userId) {
      scores[targetId] = compareFromData(data, userId, targetId);
    }
  }

  return scores;
}

async function getCompatibility(userId, targetUserId) {
  if (!isUuid(targetUserId) || targetUserId === userId) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  const blocked = await profileRepo.areUsersBlocked(userId, targetUserId);
  if (blocked) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  const visible = await compatibilityRepo.isProfileVisible(targetUserId);
  if (!visible) {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  const data = await compatibilityRepo.getComparisonData([userId, targetUserId]);
  const result = compareFromData(data, userId, targetUserId);

  if (result.reason === 'PROFILE_UNAVAILABLE') {
    throw new NotFoundError('Profile not found', 'PROFILE_NOT_FOUND');
  }

  return result;
}

module.exports = {
  getQuestions,
  getMyAnswers,
  saveMyAnswers,
  getCompatibility,
  getScoresForUsers,
  calculateComparison,
  compareFromData,
};
