import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * UOW-07 proof (T-07-04 / AC-24): caching (T-07-01, T-07-02) and revocation
 * (T-07-03) have to coexist without either one hiding the other. Unit specs
 * mock everything, so they cannot show this — only a real Redis + real DB
 * round trip can.
 *
 * ADR-07 v2 / ADR-08 (03-logical-design.md):
 *  - `getSession` checks `sessionStore.getSession` (revocation) BEFORE it
 *    touches the identity cache, so a revoked session is never served stale.
 *  - `login` / `refresh` / `switchBranch` / `exchangeHandoffCode` mint tokens
 *    from the UNCACHED `buildSessionInfo` / `resolveUserRoles` /
 *    `resolveUserBranches` — the cache must never leak into a JWT or gate an
 *    authorization decision (that was the ADR-07 v1 bug).
 */
describe('Identity cache vs. revocation (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  function decodePayload(accessToken: string): Record<string, unknown> {
    const segment = accessToken.split('.')[1];
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
  }

  async function login(): Promise<{ accessToken: string; refreshToken: string }> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123',
        organizationId: seed.organizationId,
      })
      .expect(200);
    return { accessToken: res.body.accessToken, refreshToken: res.body.refreshToken };
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // `suspend`/`archive`/`activate` gate on `branch.archive`, which
    // seedBaseData does not grant. Extend the admin role directly rather than
    // touching the shared seed helper (out of scope for this ticket).
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), 'branch.archive', 'branch.archive', 'branch')
       ON CONFLICT DO NOTHING`,
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id
       FROM permissions p WHERE p.key = 'branch.archive'
       ON CONFLICT DO NOTHING`,
      ['d0000000-0000-4000-8000-000000000001'],
    );
    // The direct SQL grant above bypasses RbacService's own invalidation
    // hook; the admin's cached permission set (warmed by seedBaseData's
    // login) would otherwise still be missing branch.archive and trip
    // assertCanGrantRoles's "you don't have this permission" check.
    await app
      .get(RbacService)
      .invalidateUserPermissions(seed.userId, seed.organizationId);
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── Scenario 1 — revoked session must not be served from a hot cache ──

  describe('Scenario 1 — logout revokes immediately despite a hot identity cache', () => {
    it('rejects the old access token on the very next call, not after TTL', async () => {
      const { accessToken } = await login();

      // Warm the identity cache (getSession -> getCachedIdentity).
      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', authHeader(accessToken))
        .expect(204);

      await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(401);
    });
  });

  // ─── Scenario 2 — role change is visible without waiting for TTL ───────

  describe('Scenario 2 — role change is reflected on the next /auth/session call', () => {
    const managerRoleId = 'd0000000-0000-4000-8000-0000000000a2';

    beforeAll(async () => {
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'manager-scenario-2', 'test-only role', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [managerRoleId, seed.organizationId],
      );
    });

    it('shows the newly granted role immediately, before the cache TTL elapses', async () => {
      const { accessToken } = await login();

      const before = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(before.body.roles).toContain('admin');
      expect(before.body.roles).not.toContain('manager-scenario-2');

      // Warm the cache again explicitly, then mutate roles via the real
      // admin endpoint (T-07-03 wires invalidateUserIdentity here).
      await request(app.getHttpServer())
        .post(`/admin/users/${seed.userId}/roles`)
        .set('Authorization', authHeader(accessToken))
        .send({ roleIds: ['d0000000-0000-4000-8000-000000000001', managerRoleId] })
        .expect(201);

      const after = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(after.body.roles).toContain('manager-scenario-2');
    });
  });

  // ─── Scenario 3 — unassigning a branch is reflected on /branches/me ────

  describe('Scenario 3 — unassigned branch disappears from /branches/me immediately', () => {
    const branchId = 'b0000000-0000-4000-8000-0000000000a3';

    beforeAll(async () => {
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Scenario 3 Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [branchId, seed.organizationId, seed.userId],
      );
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
         ON CONFLICT DO NOTHING`,
        [seed.userId, branchId, seed.organizationId],
      );
    });

    it('removes the branch from the list without waiting for the cache TTL', async () => {
      const { accessToken } = await login();

      const before = await request(app.getHttpServer())
        .get('/branches/me')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(before.body.map((b: { id: string }) => b.id)).toContain(branchId);

      await request(app.getHttpServer())
        .delete(`/branches/${branchId}/assign-user/${seed.userId}`)
        .set('Authorization', authHeader(accessToken))
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/branches/me')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(after.body.map((b: { id: string }) => b.id)).not.toContain(branchId);
    });
  });

  // ─── Scenario 4 — deactivating a branch is reflected on /branches/me ───

  describe('Scenario 4 — deactivated branch disappears from /branches/me immediately', () => {
    const branchId = 'b0000000-0000-4000-8000-0000000000a4';

    beforeAll(async () => {
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Scenario 4 Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [branchId, seed.organizationId, seed.userId],
      );

      // Assign via the real endpoint (not a raw INSERT) so the "my-branches"
      // cache — already warmed by Scenario 3 under the same user+org key —
      // is invalidated by T-07-03's wiring rather than left stale.
      const { accessToken } = await login();
      await request(app.getHttpServer())
        .post(`/branches/${branchId}/assign-user/${seed.userId}`)
        .set('Authorization', authHeader(accessToken))
        .expect(201);
    });

    it('removes the branch from the list without waiting for the cache TTL', async () => {
      const { accessToken } = await login();

      const before = await request(app.getHttpServer())
        .get('/branches/me')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(before.body.map((b: { id: string }) => b.id)).toContain(branchId);

      await request(app.getHttpServer())
        .post(`/branches/${branchId}/suspend`)
        .set('Authorization', authHeader(accessToken))
        .expect(201);

      const after = await request(app.getHttpServer())
        .get('/branches/me')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(after.body.map((b: { id: string }) => b.id)).not.toContain(branchId);
    });
  });

  // ─── Scenario 5 — refresh never mints a stale role from the cache ──────

  describe('Scenario 5 — refresh after a role change carries the NEW role', () => {
    const roleId = 'd0000000-0000-4000-8000-0000000000a5';

    beforeAll(async () => {
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'manager-scenario-5', 'test-only role', NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [roleId, seed.organizationId],
      );
    });

    it('mints a JWT carrying the new role, proving the token path bypasses the cache', async () => {
      const { accessToken, refreshToken } = await login();

      // Warm the identity cache with the pre-change role set.
      const before = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(before.body.roles).not.toContain('manager-scenario-5');

      await request(app.getHttpServer())
        .post(`/admin/users/${seed.userId}/roles`)
        .set('Authorization', authHeader(accessToken))
        .send({ roleIds: ['d0000000-0000-4000-8000-000000000001', roleId] })
        .expect(201);

      const refreshed = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken })
        .expect(200);

      const payload = decodePayload(refreshed.body.accessToken);
      expect(payload.roles).toContain('manager-scenario-5');
    });
  });

  // ─── Scenario 6 — switch-branch never honors a cached (revoked) branch ─

  describe('Scenario 6 — switch-branch rejects a branch unassigned while the identity cache is hot', () => {
    const branchId = 'b0000000-0000-4000-8000-0000000000a6';

    beforeAll(async () => {
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Scenario 6 Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [branchId, seed.organizationId, seed.userId],
      );

      // Assign via the real endpoint so any stale "my-branches"/identity
      // cache entries left by earlier scenarios are invalidated.
      const { accessToken } = await login();
      await request(app.getHttpServer())
        .post(`/branches/${branchId}/assign-user/${seed.userId}`)
        .set('Authorization', authHeader(accessToken))
        .expect(201);
    });

    it('returns 403 immediately, not the cached branch list', async () => {
      const { accessToken } = await login();

      // Warm the identity cache (branchIds included) via /auth/session.
      const warm = await request(app.getHttpServer())
        .get('/auth/session')
        .set('Authorization', authHeader(accessToken))
        .expect(200);
      expect(warm.body.branchIds).toContain(branchId);

      await request(app.getHttpServer())
        .delete(`/branches/${branchId}/assign-user/${seed.userId}`)
        .set('Authorization', authHeader(accessToken))
        .expect(200);

      await request(app.getHttpServer())
        .post('/auth/switch-branch')
        .set('Authorization', authHeader(accessToken))
        .send({ branchId })
        .expect(403);
    });
  });
});
