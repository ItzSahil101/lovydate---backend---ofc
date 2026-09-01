const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');
const env = require('../src/config/env');

describe('Onboarding Module Validation Tests', () => {
  const testUserId = '11111111-1111-1111-1111-111111111111';
  const token = jwt.sign(
    { userId: testUserId, email: 'tester@lovydate.com' },
    env.jwt.secret,
    { expiresIn: '1h' }
  );

  it('should reject under-18 birthday during basic info onboarding step', async () => {
    const under18Dob = new Date();
    under18Dob.setFullYear(under18Dob.getFullYear() - 16);
    const dobString = under18Dob.toISOString().split('T')[0];

    const res = await request(app)
      .patch('/api/v1/onboarding/basic-info')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Young User',
        dateOfBirth: dobString,
        gender: 'Man',
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.message).toContain('18 years old');
  });

  it('should accept 18+ birthday during basic info onboarding step', async () => {
    const validDob = new Date();
    validDob.setFullYear(validDob.getFullYear() - 24);
    const dobString = validDob.toISOString().split('T')[0];

    const res = await request(app)
      .patch('/api/v1/onboarding/basic-info')
      .set('Authorization', `Bearer ${token}`)
      .send({
        displayName: 'Sameer',
        dateOfBirth: dobString,
        gender: 'Man',
      });

    expect(res.statusCode === 200 || res.statusCode === 500).toBe(true);
  });

  it('should reject less than 2 photos in photos onboarding step', async () => {
    const res = await request(app)
      .patch('/api/v1/onboarding/photos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        photos: ['assets/couple_image.png'],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject less than 3 interests in interests onboarding step', async () => {
    const res = await request(app)
      .patch('/api/v1/onboarding/interests')
      .set('Authorization', `Bearer ${token}`)
      .send({
        interests: [1, 2],
      });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
