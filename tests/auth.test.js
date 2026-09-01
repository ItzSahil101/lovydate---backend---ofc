const request = require('supertest');
const app = require('../src/app');

describe('Auth Module Integration Tests', () => {
  it('should reject invalid email format on OTP request', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/request-code')
      .send({ email: 'not-an-email' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBeDefined();
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should successfully request OTP for valid email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/request-code')
      .send({ email: 'test_user@lovydate.com' });

    expect(res.statusCode).toBe(200);
    expect(res.body.data.sent).toBe(true);
  });

  it('should reject verification code without code provided', async () => {
    const res = await request(app)
      .post('/api/v1/auth/email/verify-code')
      .send({ email: 'test_user@lovydate.com' });

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject refresh token endpoint without token', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
