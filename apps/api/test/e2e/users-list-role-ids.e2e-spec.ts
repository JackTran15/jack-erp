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

/**
 * `GET /admin/users` carries each row's `roleIds` (AC-19, 2026100101 T-03-01), so the
 * role-management page can filter users by role without one detail call per user.
 */
describe('GET /admin/users roleIds (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const roleA = 'd0000000-0000-4000-8000-0000000001a1';
  const roleB = 'd0000000-0000-4000-8000-0000000001b1';
  const foreignOrgId = 'a0000000-0000-4000-8000-0000000001f1';
  const userIds: Record<'both' | 'one' | 'none', string> = { both: '', one: '', none: '' };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    for (const [id, name] of [
      [roleA, 'Vai trò A'],
      [roleB, 'Vai trò B'],
    ]) {
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, null, NOW(), NOW())`,
        [id, seed.organizationId, name],
      );
    }

    for (const key of Object.keys(userIds) as Array<keyof typeof userIds>) {
      await request(app.getHttpServer())
        .post('/admin/users')
        .set(headers())
        .send({
          email: `role-ids-${key}@test.com`,
          firstName: 'Role',
          lastName: key,
          temporaryPassword: 'password123',
        })
        .expect(201);
      const [{ id }] = await ds.query(`SELECT id FROM users WHERE email = $1`, [
        `role-ids-${key}@test.com`,
      ]);
      userIds[key] = id;
      // The list only shows users in the caller's branches.
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid)`,
        [id, seed.branchId, seed.organizationId, seed.userId],
      );
    }

    const grant = (userId: string, roleId: string, orgId: string) =>
      ds.query(
        `INSERT INTO user_roles (id, user_id, role_id, organization_id)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
        [userId, roleId, orgId],
      );
    await grant(userIds.both, roleA, seed.organizationId);
    await grant(userIds.both, roleB, seed.organizationId);
    await grant(userIds.one, roleA, seed.organizationId);
    // A row scoped to another organization must not leak into this org's list.
    await grant(userIds.one, roleB, foreignOrgId);
  });

  afterAll(async () => {
    await app?.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  it('returns roleIds per user, scoped to the caller organization (AC-19)', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/users')
      .query({ page: 1, pageSize: 200 })
      .set(headers())
      .expect(200);

    expect(res.body.data.map((u: { id: string }) => u.id)).toEqual(
      expect.arrayContaining(Object.values(userIds)),
    );
    const byId = new Map<string, { roleIds: string[] }>(
      res.body.data.map((u: { id: string; roleIds: string[] }) => [u.id, u]),
    );
    expect([...(byId.get(userIds.both)?.roleIds ?? [])].sort()).toEqual([roleA, roleB].sort());
    expect(byId.get(userIds.one)?.roleIds).toEqual([roleA]);
    expect(byId.get(userIds.none)?.roleIds).toEqual([]);
    // Every row carries the field, including the seeded admin.
    for (const row of res.body.data) {
      expect(Array.isArray(row.roleIds)).toBe(true);
    }
  });

  it('matches the roleIds of the per-user detail endpoint', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/users')
      .query({ page: 1, pageSize: 200 })
      .set(headers())
      .expect(200);
    for (const row of list.body.data as Array<{ id: string; roleIds: string[] }>) {
      const detail = await request(app.getHttpServer())
        .get(`/admin/users/${row.id}`)
        .set(headers())
        .expect(200);
      expect([...row.roleIds].sort()).toEqual([...detail.body.roleIds].sort());
    }
  });
});
