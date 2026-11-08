const test = require('node:test');
const assert = require('node:assert/strict');

const {
  calculateComparison,
  compareFromData,
} = require('../src/modules/compatibility/compatibility.service');

function makeUser({
  option = 'Introverted',
  interests = [],
  pets = null,
  goal = null,
  count = 10,
} = {}) {
  return {
    profile: {
      pets,
      relationshipGoal: goal,
      bio: 'same bio text',
    },
    interests,
    answers: Array.from({ length: count }, (_, i) => ({
      questionId: i + 1,
      selectedOption: option,
    })),
  };
}

test('identical complete answers produce 100% compatibility', () => {
  const result = calculateComparison(makeUser(), makeUser());
  assert.equal(result.score, 100);
});

test('unavailable categories do not reduce the score', () => {
  const result = calculateComparison(makeUser(), makeUser());

  assert.equal(result.score, 100);
  assert.equal(result.breakdown.interests.available, false);
  assert.equal(result.breakdown.lifestyle.available, false);
  assert.equal(result.breakdown.bio.available, false);
  assert.equal(result.breakdown.connectionGoals.available, false);
  assert.equal(result.breakdown.questionnaire.effectiveWeight, 100);
});

test('bio keywords are not exposed or scored', () => {
  const result = calculateComparison(makeUser(), makeUser());

  assert.equal(result.breakdown.bio.score, null);
  assert.equal(result.breakdown.bio.available, false);
  assert.equal('sharedKeywords' in result.breakdown.bio, false);
});

test('different interests and preferences affect the score', () => {
  const first = makeUser({
    interests: ['Gaming'],
    pets: 'Have pets',
    goal: 'Long-term',
  });

  const second = makeUser({
    interests: ['Music'],
    pets: 'No pets',
    goal: 'Friendship',
  });

  const result = calculateComparison(first, second);

  assert.ok(result.score < 100);
  assert.equal(result.breakdown.interests.score, 0);
  assert.equal(result.breakdown.lifestyle.score, 0);
  assert.equal(result.breakdown.connectionGoals.score, 0);
});

test('incomplete questionnaires do not produce a score', () => {
  const result = compareFromData(
    {
      first: makeUser({ count: 9 }),
      second: makeUser(),
    },
    'first',
    'second'
  );

  assert.equal(result.isAvailable, false);
  assert.equal(result.reason, 'QUESTIONNAIRE_INCOMPLETE');
});
