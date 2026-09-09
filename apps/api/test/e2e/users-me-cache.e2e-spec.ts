import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { RedisService } from '../../src/modules/redis/redis.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * The unit tests prove each half calls what it should. What nothing else covers
 * is the round trip: read, cache, write somewhere else, read again. ADR-04 of
 * 2026090805-pos-initial-load-latency names a forgotten invalidation call as the
 * real risk, and its 15-minute TTL is long enough that manual testing would not
 * catch one — so no test here may wait out a TTL. If a case only passes after a
 * sleep, invalidation is broken.
 */
describe('users/me cache (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let redis: RedisService;

  const CACHE_NAMESPACE = 'cache';

  const meKey = (userId: string, orgId: string): string =>
    `users-me:${userId}:${orgId}`;

  const getMe = (token: string) =>
    request(app.getHttpServer())
      .get('/admin/users/me')
      .set('Authorization', authHeader(token))
      .expect(200);

  const cachedEntry = (userId: string, orgId: string) =>
    redis.get(CACHE_NAMESPACE, meKey(userId, orgId));

  // `resetDatabase` runs synchronize(true) over every entity in AppModule, which
  // the shared 180s hook budget in jest-setup.ts only just covers on a warm
  // machine — this suite crossed it. The budget is raised here rather than
  // globally so the tighter default keeps applying to everything else.
  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    redis = app.get(RedisService);
  }, 420_000);

  afterAll(async () => {
    await redis.del(CACHE_NAMESPACE, meKey(seed.userId, seed.organizationId));
    await app.close();
  });

  beforeEach(async () => {
    await redis.del(CACHE_NAMESPACE, meKey(seed.userId, seed.organizationId));
  });

  describe('read path', () => {
    it('stores the payload on first read and serves the second from Redis', async () => {
      expect(await cachedEntry(seed.userId, seed.organizationId)).toBeNull();

      const first = await getMe(seed.accessToken);
      expect(await cachedEntry(seed.userId, seed.organizationId)).not.toBeNull();

      const second = await getMe(seed.accessToken);
      expect(second.body).toEqual(first.body);
    });

    it('keys the entry by user and organization together', async () => {
      await getMe(seed.accessToken);

      // Same user id, a different organization: must not resolve to the entry
      // written above.
      expect(
        await cachedEntry(seed.userId, '00000000-0000-0000-0000-000000000000'),
      ).toBeNull();
    });
  });

  describe('invalidation', () => {
    /**
     * Each case: warm the cache, mutate through a different endpoint, read
     * again. The assertion is on the payload rather than on the Redis key, so
     * it fails the same way a user would see it fail.
     */
    const warmThenMutate = async (
      mutate: () => Promise<unknown>,
    ): Promise<Record<string, unknown>> => {
      await getMe(seed.accessToken);
      expect(await cachedEntry(seed.userId, seed.organizationId)).not.toBeNull();

      await mutate();

      expect(await cachedEntry(seed.userId, seed.organizationId)).toBeNull();
      const after = await getMe(seed.accessToken);
      return after.body as Record<string, unknown>;
    };

    it('drops the entry when the role set is replaced', async () => {
      const before = await getMe(seed.accessToken);
      const roleIds = (before.body as { roleIds: string[] }).roleIds;

      const body = await warmThenMutate(() =>
        request(app.getHttpServer())
          .post(`/admin/users/${seed.userId}/roles`)
          .set('Authorization', authHeader(seed.accessToken))
          .send({ roleIds })
          .expect(201),
      );

      expect(body.roleIds).toEqual(roleIds);
    });

    it('drops the entry when the branch assignment set is replaced', async () => {
      const body = await warmThenMutate(() =>
        request(app.getHttpServer())
          .post(`/admin/users/${seed.userId}/branches`)
          .set('Authorization', authHeader(seed.accessToken))
          .send({ branchIds: [seed.branchId] })
          .expect(201),
      );

      expect(body.branchIds).toEqual([seed.branchId]);
    });

    it('drops the entry when the account itself is edited', async () => {
      const body = await warmThenMutate(() =>
        request(app.getHttpServer())
          .patch(`/admin/users/${seed.userId}`)
          .set('Authorization', authHeader(seed.accessToken))
          .send({ firstName: 'Renamed' })
          .expect(200),
      );

      expect(body.firstName).toBe('Renamed');
    });

    it('drops the entry when the employee profile is edited', async () => {
      const body = await warmThenMutate(() =>
        request(app.getHttpServer())
          .patch(`/admin/users/${seed.userId}`)
          .set('Authorization', authHeader(seed.accessToken))
          // `code` is required on EmployeeProfileDto, and the global
          // ValidationPipe runs forbidNonWhitelisted — a partial profile is a 400.
          .send({ profile: { code: 'NV000001', mobile: '0900000123' } })
          .expect(200),
      );

      expect(
        (body.profile as { mobile: string } | null)?.mobile,
      ).toBe('0900000123');
    });
  });
});
