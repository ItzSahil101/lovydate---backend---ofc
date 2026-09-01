const { encodeCursor, decodeCursor } = require('../src/shared/cursor');
const { basicInfoSchema, photosSchema, interestsSchema } = require('../src/modules/onboarding/onboarding.validation');
const {
  requestCodeSchema,
  verifyCodeSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
} = require('../src/modules/auth/auth.validation');

describe('Shared Utilities & Validation Tests', () => {
  describe('Cursor Pagination Utilities', () => {
    it('should encode and decode cursor symmetrically', () => {
      const payload = { createdAt: '2026-08-31T20:00:00.000Z', id: 'test-uuid-123' };
      const cursor = encodeCursor(payload);
      expect(typeof cursor).toBe('string');
      expect(cursor.length).toBeGreaterThan(10);

      const decoded = decodeCursor(cursor);
      expect(decoded).toEqual(payload);
    });

    it('should return null on invalid or empty cursor', () => {
      expect(decodeCursor(null)).toBeNull();
      expect(decodeCursor('')).toBeNull();
      expect(decodeCursor('invalid-base64-content')).toBeNull();
    });
  });

  describe('Auth Validation Schemas', () => {
    it('should validate valid email for OTP request', () => {
      const { error } = requestCodeSchema.validate({ email: 'user@lovydate.com' });
      expect(error).toBeUndefined();
    });

    it('should reject invalid email for OTP request', () => {
      const { error } = requestCodeSchema.validate({ email: 'invalid_email' });
      expect(error).toBeDefined();
    });

    it('should reject OTP verification without 6-digit code', () => {
      const { error } = verifyCodeSchema.validate({ email: 'user@lovydate.com', code: '123' });
      expect(error).toBeDefined();
    });

    it('should accept valid OTP verification payload', () => {
      const { error } = verifyCodeSchema.validate({ email: 'user@lovydate.com', code: '123456' });
      expect(error).toBeUndefined();
    });

    it('should validate forgot password request schema', () => {
      const { error: err1 } = forgotPasswordRequestSchema.validate({ email: 'sameer@gmail.com' });
      expect(err1).toBeUndefined();

      const { error: err2 } = forgotPasswordRequestSchema.validate({ email: 'not-an-email' });
      expect(err2).toBeDefined();
    });

    it('should validate forgot password reset schema', () => {
      const { error: err1 } = forgotPasswordResetSchema.validate({
        email: 'sameer@gmail.com',
        code: '654321',
        newPassword: 'MyNewStrongPassword123',
      });
      expect(err1).toBeUndefined();

      const { error: err2 } = forgotPasswordResetSchema.validate({
        email: 'sameer@gmail.com',
        code: '12',
        newPassword: 'short',
      });
      expect(err2).toBeDefined();
    });
  });

  describe('Onboarding Step Validation Schemas', () => {
    it('should reject under-18 users in basic info step', () => {
      const under18Dob = new Date();
      under18Dob.setFullYear(under18Dob.getFullYear() - 17);
      const dobString = under18Dob.toISOString().split('T')[0];

      const { error } = basicInfoSchema.validate({
        displayName: 'Young User',
        dateOfBirth: dobString,
        gender: 'Woman',
      });

      expect(error).toBeDefined();
      expect(error.message).toContain('18 years old');
    });

    it('should accept 18+ users in basic info step', () => {
      const validDob = new Date();
      validDob.setFullYear(validDob.getFullYear() - 25);
      const dobString = validDob.toISOString().split('T')[0];

      const { error } = basicInfoSchema.validate({
        displayName: 'Sameer',
        dateOfBirth: dobString,
        gender: 'Man',
      });

      expect(error).toBeUndefined();
    });

    it('should require minimum 2 photos', () => {
      const { error: err1 } = photosSchema.validate({ photos: ['assets/couple_image.png'] });
      expect(err1).toBeDefined();

      const { error: err2 } = photosSchema.validate({
        photos: ['assets/couple_image.png', 'assets/branding_icon.png'],
      });
      expect(err2).toBeUndefined();
    });

    it('should require between 3 and 8 interests', () => {
      const { error: err1 } = interestsSchema.validate({ interests: ['Coffee', 'Music'] });
      expect(err1).toBeDefined();

      const { error: err2 } = interestsSchema.validate({
        interests: ['Coffee', 'Music', 'Travel', 'Hiking', 'Reading'],
      });
      expect(err2).toBeUndefined();

      const { error: err3 } = interestsSchema.validate({
        interests: ['Coffee', 'Music', 'Travel', 'Hiking', 'Reading', 'Movies', 'Dogs', 'Cats', 'Gaming'],
      });
      expect(err3).toBeDefined();
    });
  });

  describe('Media S3 Service', () => {
    const { getPublicUrl, uploadFileToS3 } = require('../src/modules/media/media.service');
    const { s3Client } = require('../src/infrastructure/s3/client');

    it('should generate correct public URL pointing to MinIO S3 bucket', () => {
      const url = getPublicUrl('sample-image-id.jpg');
      expect(url).toBe('https://minio.lovydate.fun/images/sample-image-id.jpg');
    });

    it('should upload buffer to S3 client and return formatted object', async () => {
      const sendSpy = jest.spyOn(s3Client, 'send').mockResolvedValue({});
      const fakeFile = {
        originalname: 'my-avatar.png',
        buffer: Buffer.from('fake-image-bytes'),
        mimetype: 'image/png',
        size: 16,
      };

      const result = await uploadFileToS3(fakeFile);
      expect(sendSpy).toHaveBeenCalledTimes(1);
      expect(result.url).toMatch(/^https:\/\/minio\.lovydate\.fun\/images\/[a-f0-9-]+\.png$/);
      expect(result.key).toMatch(/^[a-f0-9-]+\.png$/);
      expect(result.mimetype).toBe('image/png');
      expect(result.size).toBe(16);

      sendSpy.mockRestore();
    });
  });
});

