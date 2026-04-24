import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Auth (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    it('should return tokens for valid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body).toHaveProperty('expiresIn');
      expect(res.body.session).toEqual(
        expect.objectContaining({
          userId: seed.userId,
          organizationId: seed.organizationId,
        }),
      );
    });

    it('should reject invalid password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'wrong-password',
          organizationId: seed.organizationId,
        })
        .expect(401);
    });

    it('should reject unknown email', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nobody@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(401);
    });
  });

  // ─── Session ──────────────────────────────────────────────────────

  describe('GET /auth/session', () => {
    it('should return session info with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(seed.accessToken))
        .expect(200);

      expect(res.body).toHaveProperty('userId', seed.userId);
      expect(res.body).toHaveProperty('organizationId', seed.organizationId);
      expect(res.body).toHaveProperty('roles');
      expect(res.body).toHaveProperty('branchIds');
    });

    it('should reject request without token', async () => {
      await request(app.getHttpServer())
        .get('/auth/session')
        .expect(401);
    });

    it('should reject expired/invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', 'Bearer invalid.token.here')
        .expect(401);
    });
  });

  // ─── Refresh ──────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('should rotate tokens with valid refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.accessToken).not.toBe(loginRes.body.accessToken);
    });

    it('should reject reuse of consumed refresh token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: loginRes.body.refreshToken })
        .expect(401);
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('should revoke session so subsequent requests fail', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(200);

      const token = loginRes.body.accessToken;

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', authHeader(token))
        .expect(204);

      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(token))
        .expect(401);
    });
  });

  // ─── Branch scope enforcement ─────────────────────────────────────

  describe('Branch scope enforcement', () => {
    it('should restrict access to branch-scoped endpoints to assigned branches', async () => {
      const res = await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .set('X-Branch-Id', seed.branchId)
        .expect(200);

      expect(res.body).toHaveProperty('data');
    });

    it('should reject access to an unassigned branch', async () => {
      const fakeBranchId = 'b9999999-9999-4999-9999-999999999999';

      await request(app.getHttpServer())
        .get('/customers')
        .set('Authorization', authHeader(seed.accessToken))
        .set('X-Branch-Id', fakeBranchId)
        .expect(403);
    });
  });
});
