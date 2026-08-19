import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';
const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';

// The shared seedBaseData() fixture predates this feature and doesn't grant
// the api-key.* permissions — add them to the same seeded role rather than
// touching the shared fixture every other e2e spec depends on.
//
// RbacService.hasPermission() caches the resolved permission set per user+org
// for 300s (rbac.service.ts). resetDatabase() wipes Postgres but not Redis,
// and seedBaseData()'s user/org ids are the same fixed UUIDs across every
// e2e spec file — so a stale cache entry from an earlier spec run in this
// same test session would silently hide these newly-granted permissions.
// Explicitly invalidate rather than trust a fresh cache.
async function grantApiKeyPermissions(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
  const roleId = SEEDED_ROLE_ID;
  for (const key of [
    'api-key.read',
    'api-key.create',
    'api-key.update',
    'api-key.delete',
  ]) {
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, 'api-key')
       ON CONFLICT DO NOTHING`,
      [key],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id
       FROM permissions p WHERE p.key = $2
       ON CONFLICT DO NOTHING`,
      [roleId, key],
    );
  }
  await app
    .get(RbacService)
    .invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);
}

describe('Admin API keys (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await grantApiKeyPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const createPayload = {
    name: 'Đối tác ABC',
    roles: [SEEDED_ROLE_ID], // must be a real roles.id — ADR-04, 03-logical-design.md
    ipWhitelist: ['203.0.113.5'],
  };

  it('creates a key, returns the raw secret exactly once (AC-08)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send(createPayload)
      .expect(201);

    expect(createRes.body.rawKey).toEqual(expect.any(String));
    expect(createRes.body.keyPrefix).toBe(createRes.body.rawKey.slice(0, 8));
    expect(createRes.body).not.toHaveProperty('keyHash');

    const listRes = await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    const created = listRes.body.data.find(
      (row: any) => row.id === createRes.body.id,
    );
    expect(created).toBeDefined();
    expect(created).not.toHaveProperty('keyHash');
    expect(created).not.toHaveProperty('rawKey');

    const detailRes = await request(app.getHttpServer())
      .get(`/admin/entities/api-keys/records/${createRes.body.id}`)
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    expect(detailRes.body).not.toHaveProperty('keyHash');
    expect(detailRes.body).not.toHaveProperty('rawKey');
  });

  it('revokes a key (soft-delete, not hard-delete) and hides it from the default list (AC-10)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ ...createPayload, name: 'Key to revoke' })
      .expect(201);
    const id = createRes.body.id;

    await request(app.getHttpServer())
      .delete(`/admin/entities/api-keys/records/${id}`)
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    const listRes = await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);
    expect(
      listRes.body.data.some((row: any) => row.id === id),
    ).toBe(false);

    const ds = app.get(DataSource);
    const [row] = await ds.query(
      `SELECT deleted_at FROM api_keys WHERE id = $1::uuid`,
      [id],
    );
    expect(row).toBeDefined();
    expect(row.deleted_at).not.toBeNull();
  });

  it('rejects creation without ip whitelist entries', async () => {
    await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ name: 'No whitelist', roles: [SEEDED_ROLE_ID], ipWhitelist: [] })
      .expect(400);
  });

  it('rejects an unauthenticated request with 401 (no credential at all)', async () => {
    await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .expect(401);
  });

  it('rejects an authenticated actor whose role lacks api-key.read with 403', async () => {
    const ds = app.get(DataSource);
    const noAccessUserId = 'e0000000-0000-4000-8000-000000000001';
    const noAccessRoleId = 'e0000000-0000-4000-8000-000000000002';

    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'no-api-key-access', 'Role without api-key.read', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [noAccessRoleId, seed.organizationId],
    );
    // Deliberately no role_permissions row for this role — it holds nothing.
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       SELECT $1::uuid, $2::uuid, 'no-access@test.com', password_hash, 'No', 'Access', true, NOW(), NOW()
       FROM users WHERE id = $3::uuid
       ON CONFLICT (id) DO NOTHING`,
      [noAccessUserId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [noAccessUserId, noAccessRoleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)
       ON CONFLICT DO NOTHING`,
      [noAccessUserId, seed.branchId, seed.organizationId],
    );

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'no-access@test.com',
        password: 'password123',
        organizationId: seed.organizationId,
      })
      .expect(200);

    await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(loginRes.body.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(403);
  });
});
