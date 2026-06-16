import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
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

  // ─── Switch branch ────────────────────────────────────────────────

  describe('POST /auth/switch-branch', () => {
    const secondBranchId = 'b0000000-0000-4000-8000-000000000002';

    function decodeActiveBranch(accessToken: string): string | undefined {
      const segment = accessToken.split('.')[1];
      const payload = JSON.parse(
        Buffer.from(segment, 'base64url').toString('utf8'),
      );
      return payload.branchId;
    }

    async function login(): Promise<{ accessToken: string }> {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'admin@test.com',
          password: 'password123',
          organizationId: seed.organizationId,
        })
        .expect(200);
      return { accessToken: res.body.accessToken };
    }

    beforeAll(async () => {
      const ds = app.get(DataSource);
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Second Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [secondBranchId, seed.organizationId, seed.userId],
      );
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
         ON CONFLICT DO NOTHING`,
        [seed.userId, secondBranchId, seed.organizationId],
      );
    });

    it('mints new tokens carrying the selected active branch', async () => {
      const { accessToken } = await login();

      const res = await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .set('Authorization', authHeader(accessToken))
        .send({ branchId: secondBranchId })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
      expect(res.body.accessToken).not.toBe(accessToken);
      expect(decodeActiveBranch(res.body.accessToken)).toBe(secondBranchId);
    });

    it('revokes the previous session so the old access token is rejected', async () => {
      const { accessToken: oldToken } = await login();

      const switched = await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .set('Authorization', authHeader(oldToken))
        .send({ branchId: secondBranchId })
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(switched.body.accessToken))
        .expect(200);

      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(oldToken))
        .expect(401);
    });

    it('rejects switching to a branch the user is not assigned to', async () => {
      const { accessToken } = await login();

      await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .set('Authorization', authHeader(accessToken))
        .send({ branchId: 'b9999999-9999-4999-9999-999999999999' })
        .expect(403);
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .send({ branchId: secondBranchId })
        .expect(401);
    });
  });
});
