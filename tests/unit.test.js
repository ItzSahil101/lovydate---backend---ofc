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
    const {
      getPublicUrl,
      getMediaKind,
      isManagedMediaUrl,
      readMp4DurationSeconds,
      uploadFileToS3,
    } = require('../src/modules/media/media.service');
    const { s3Client } = require('../src/infrastructure/s3/client');

    it('should generate correct public URL pointing to server media endpoint', () => {
      const url = getPublicUrl('sample-image-id.jpg');
      expect(url).toBe('https://server.lovydate.fun/api/v1/media/sample-image-id.jpg');
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
      expect(result.url).toMatch(/^https:\/\/server\.lovydate\.fun\/api\/v1\/media\/[a-f0-9-]+\.png$/);
      expect(result.key).toMatch(/^[a-f0-9-]+\.png$/);
      expect(result.mimetype).toBe('image/png');
      expect(result.size).toBe(16);

      sendSpy.mockRestore();
    });

    it('should classify chat media and read MP4 movie-header duration', () => {
      expect(getMediaKind('image/webp')).toBe('image');
      expect(getMediaKind('audio/mp4')).toBe('audio');
      expect(getMediaKind('video/quicktime')).toBe('video');
      expect(isManagedMediaUrl('https://server.lovydate.fun/api/v1/media/example.mp4')).toBe(true);
      expect(isManagedMediaUrl('https://example.com/untrusted.mp4')).toBe(false);

      const fakeMovie = Buffer.alloc(40);
      fakeMovie.write('mvhd', 4, 'ascii');
      fakeMovie.writeUInt8(0, 8);
      fakeMovie.writeUInt32BE(1000, 20);
      fakeMovie.writeUInt32BE(90000, 24);
      expect(readMp4DurationSeconds(fakeMovie)).toBe(90);
    });
  });

  describe('Relationship Controllers', () => {
    const likesController = require('../src/modules/likes/likes.controller');
    const likesService = require('../src/modules/likes/likes.service');
    const blocksController = require('../src/modules/blocks/blocks.controller');
    const blocksService = require('../src/modules/blocks/blocks.service');

    function responseDouble() {
      return {
        statusCode: 0,
        body: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          this.body = body;
          return this;
        },
      };
    }

    it('should invoke the like service and return a successful response', async () => {
      const spy = jest.spyOn(likesService, 'likeUser').mockResolvedValue({ liked: true, isMatch: false });
      const res = responseDouble();
      await likesController.likeUser(
        { user: { userId: 'source' }, params: {}, body: { targetUserId: 'target' } },
        res,
        (error) => { throw error; }
      );
      expect(spy).toHaveBeenCalledWith('source', 'target');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.liked).toBe(true);
      spy.mockRestore();
    });

    it('should invoke the block service and return a successful response', async () => {
      const spy = jest.spyOn(blocksService, 'blockUser').mockResolvedValue({ blocked: true });
      const res = responseDouble();
      await blocksController.blockUser(
        { user: { userId: 'source' }, params: {}, body: { targetUserId: 'target' } },
        res,
        (error) => { throw error; }
      );
      expect(spy).toHaveBeenCalledWith('source', 'target');
      expect(res.statusCode).toBe(200);
      expect(res.body.data.blocked).toBe(true);
      spy.mockRestore();
    });

    it('should expose the mobile-client relationship route aliases', async () => {
      const request = require('supertest');
      const jwt = require('jsonwebtoken');
      const env = require('../src/config/env');
      const redis = require('../src/infrastructure/redis/client');
      const reportsService = require('../src/modules/reports/reports.service');
      const app = require('../src/app');
      const userId = '11111111-1111-4111-8111-111111111111';
      const targetUserId = '22222222-2222-4222-8222-222222222222';
      const token = jwt.sign({ userId, email: 'route-test@lovydate.com' }, env.jwt.secret);

      const incrSpy = jest.spyOn(redis, 'incr').mockResolvedValue(1);
      const expireSpy = jest.spyOn(redis, 'expire').mockResolvedValue(1);
      const ttlSpy = jest.spyOn(redis, 'ttl').mockResolvedValue(60);
      const likeSpy = jest.spyOn(likesService, 'likeUser').mockResolvedValue({ liked: true, isMatch: false });
      const blockSpy = jest.spyOn(blocksService, 'blockUser').mockResolvedValue({ blocked: true });
      const reportSpy = jest.spyOn(reportsService, 'reportUser').mockResolvedValue({ reported: true, reportId: 'report-id' });

      await request(app)
        .post('/api/v1/likes')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetUserId })
        .expect(200);
      await request(app)
        .post('/api/v1/blocks')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetUserId })
        .expect(200);
      await request(app)
        .post('/api/v1/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ targetUserId, reason: 'Spam' })
        .expect(201);

      for (const spy of [
        incrSpy,
        expireSpy,
        ttlSpy,
        likeSpy,
        blockSpy,
        reportSpy,
      ]) {
        spy.mockRestore();
      }
    });
  });

  describe('Mentions & Notifications Utilities', () => {
    it('should accurately extract mentions from post text', () => {
      const text = 'Hey @JaneDoe and @alex_99, check out this beautiful view with @Sameer!';
      const mentionMatches = text.match(/@([a-zA-Z0-9_\.\-]+)/g);
      expect(mentionMatches).toEqual(['@JaneDoe', '@alex_99', '@Sameer']);
      const names = mentionMatches.map((m) => m.substring(1));
      expect(names).toEqual(['JaneDoe', 'alex_99', 'Sameer']);
    });

    it('should return null when no mentions exist', () => {
      const text = 'Just a regular post without mentions #sunset #vibes';
      const mentionMatches = text.match(/@([a-zA-Z0-9_\.\-]+)/g);
      expect(mentionMatches).toBeNull();
    });
  });
});
