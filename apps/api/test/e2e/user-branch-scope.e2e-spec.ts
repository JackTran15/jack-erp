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
 * Staffing is scoped by permission, never by role name:
 *   - `iam.user.branches.write`     → may only assign the actor's own branches
 *   - `iam.user.branches.write.all` → may assign any branch of the organization
 *
 * and a role is offered to the UI (`RoleSummary.assignable`) only when it
 * carries no permission the caller lacks — the same comparison the write path
 * enforces, so the form can never offer something the API then rejects.
 */
describe('User branch assignment scope (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  /** A second branch nobody in the base seed belongs to. */
  const otherBranchId = 'b0000000-0000-4000-8000-0000000000ff';
  /** An actor holding iam.user.branches.write.all. */
  const chainRoleId = 'd0000000-0000-4000-8000-0000000000ff';
  let chainToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Chi Nhánh Nha Trang', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherBranchId, seed.organizationId, seed.userId],
    );

    // Created through the API so the password hashing matches production.
    await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send({
        email: 'chain@test.com',
        firstName: 'Chain',
        lastName: 'Manager',
        temporaryPassword: 'password123',
      })
      .expect(201);
    const [{ id: createdId }] = await ds.query(
      `SELECT id FROM users WHERE email = 'chain@test.com'`,
    );

    // Role granted directly: the seeded admin cannot hand out a permission it
    // does not itself hold, which is exactly the rule under test.
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Quản lý chuỗi', null, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [chainRoleId, seed.organizationId],
    );
    for (const key of [
      'iam.user.read',
      'iam.user.write',
      'iam.user.branches.write',
      'iam.user.branches.write.all',
      'iam.role.read',
    ]) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'iam') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [chainRoleId, key],
      );
    }
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
      [createdId, chainRoleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid) ON CONFLICT DO NOTHING`,
      [createdId, seed.branchId, seed.organizationId],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'chain@test.com',
        password: 'password123',
        organizationId: seed.organizationId,
      })
      .expect(200);
    chainToken = login.body.accessToken;
  });

  afterAll(async () => {
    // Optional chaining: when the boot in beforeAll times out (kafkajs consumer
    // groups rebalance slowly if a dev API is running against the same broker),
    // `app` is never assigned and an unguarded close masks the real failure.
    await app?.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function chainHeaders() {
    return {
      Authorization: authHeader(chainToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  const newEmployee = (branchIds: string[]) => ({
    email: `emp.${Date.now()}${Math.floor(Math.random() * 1000)}@test.com`,
    firstName: 'Nhan',
    lastName: 'Vien',
    temporaryPassword: 'password123',
    branchIds,
  });

  it('refuses to staff a branch the actor does not belong to', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send(newEmployee([otherBranchId]))
      .expect(403);
    expect(res.body.message).toMatch(/Cannot assign branches you do not belong to/);
  });

  it('accepts a branch the actor belongs to', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send(newEmployee([seed.branchId]))
      .expect(201);
    expect(res.body.branchIds).toEqual([seed.branchId]);
  });

  it('refuses to move an existing employee to an out-of-scope branch', async () => {
    const created = await request(app.getHttpServer())
      .post('/admin/users')
      .set(headers())
      .send(newEmployee([seed.branchId]))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/users/${created.body.id}/branches`)
      .set(headers())
      .send({ branchIds: [otherBranchId] })
      .expect(403);
  });

  it('lets iam.user.branches.write.all staff any branch of the organization', async () => {
    const res = await request(app.getHttpServer())
      .post('/admin/users')
      .set(chainHeaders())
      .send(newEmployee([otherBranchId]))
      .expect(201);
    expect(res.body.branchIds).toEqual([otherBranchId]);
  });

  it('marks a role assignable only when the caller holds every permission it carries', async () => {
    const res = await request(app.getHttpServer())
      .get('/admin/roles')
      .set(chainHeaders())
      .expect(200);

    const byName = Object.fromEntries(
      res.body.map((r: { name: string; assignable: boolean }) => [
        r.name,
        r.assignable,
      ]),
    );
    // Its own role is a subset of what it holds; the seeded admin role is not.
    expect(byName['Quản lý chuỗi']).toBe(true);
    expect(byName['admin']).toBe(false);
  });
});
