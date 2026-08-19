import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
  request,
} from './setup/test-app';

const SEEDED_ROLE_ID = 'd0000000-0000-4000-8000-000000000001';
const SEEDED_USER_ID = 'c0000000-0000-4000-8000-000000000001';
const SEEDED_ORG_ID = 'a0000000-0000-4000-8000-000000000001';

// Same reasoning as api-key-admin.e2e-spec.ts: seedBaseData()'s role predates
// this feature, and RbacService caches resolved permissions for 300s across
// e2e runs (resetDatabase() only wipes Postgres, not Redis) — grant and
// invalidate explicitly rather than trust a fresh cache.
async function grantApiKeyPermissions(app: INestApplication): Promise<void> {
  const ds = app.get(DataSource);
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
      [SEEDED_ROLE_ID, key],
    );
  }
  await app
    .get(RbacService)
    .invalidateUserPermissions(SEEDED_USER_ID, SEEDED_ORG_ID);
}

describe('AuthGuard — API key path (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let rawKey: string;
  let keyId: string;
  const whitelistedIp = '203.0.113.5';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await grantApiKeyPermissions(app);

    // seedBaseData()'s role already carries customer.read + api-key.* (just
    // granted above) — reusing it means the shadow user gets the exact same
    // permission set as the seeded admin, so "behaves like a valid JWT
    // request" (AC-01) is a direct, literal comparison.
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Guard test key',
        roles: [SEEDED_ROLE_ID],
        ipWhitelist: [whitelistedIp],
      })
      .expect(201);
    rawKey = createRes.body.rawKey;
    keyId = createRes.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-01: valid key + whitelisted IP behaves exactly like a valid JWT request', async () => {
    const viaApiKey = await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('X-Api-Key', rawKey)
      .set('X-Forwarded-For', whitelistedIp)
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    const viaJwt = await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    expect(viaApiKey.body).toEqual(viaJwt.body);
  });

  it('AC-02: no credential at all is rejected with 401 (unchanged)', async () => {
    await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .expect(401);
  });

  it('AC-03: @Public() endpoints are unaffected', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(200);
  });

  it('AC-04: valid key from a non-whitelisted IP is rejected with 403, not 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('X-Api-Key', rawKey)
      .set('X-Forwarded-For', '10.0.0.1')
      .expect(403);
  });

  it('AC-05: a CIDR range in the whitelist matches an IP inside it', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'CIDR test key',
        roles: [SEEDED_ROLE_ID],
        ipWhitelist: ['198.51.100.0/28'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('X-Api-Key', createRes.body.rawKey)
      .set('X-Forwarded-For', '198.51.100.5')
      .set('X-Branch-Id', seed.branchId)
      .expect(200);
  });

  it('AC-06: an unknown key is rejected with 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('X-Api-Key', 'totally-bogus-key')
      .expect(401);
  });

  it('regression: Bearer wins when both Authorization and X-Api-Key are present', async () => {
    // A bogus X-Api-Key alone would 401 — proves the JWT path, not the key, decided this.
    await request(app.getHttpServer())
      .get('/admin/entities/customers/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Api-Key', 'totally-bogus-key')
      .set('X-Branch-Id', seed.branchId)
      .expect(200);
  });

  it('AC-09: a key from one org never resolves data belonging to another org', async () => {
    const otherOrgId = 'a0000000-0000-4000-8000-000000000099';
    const otherBranchId = 'b0000000-0000-4000-8000-000000000099';
    const otherUserId = 'c0000000-0000-4000-8000-000000000099';
    const otherRoleId = 'd0000000-0000-4000-8000-000000000099';
    const ds = app.get(DataSource);

    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Other Org', 'other-admin@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherOrgId, otherUserId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Main Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherBranchId, otherOrgId, otherUserId],
    );
    const passwordHash = await bcrypt.hash('password123', 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'other-admin@test.com', $3, 'Other', 'Admin', true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherUserId, otherOrgId, passwordHash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'other-admin', 'Full access role for other org', NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherRoleId, otherOrgId],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT DO NOTHING`,
      [otherUserId, otherRoleId, otherOrgId],
    );
    for (const key of ['api-key.read', 'api-key.create']) {
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [otherRoleId, key],
      );
    }

    const otherLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'other-admin@test.com',
        password: 'password123',
        organizationId: otherOrgId,
      })
      .expect(200);

    const otherKeyRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(otherLogin.body.accessToken))
      .set('X-Branch-Id', otherBranchId)
      .send({
        name: 'Other org key',
        roles: [otherRoleId],
        ipWhitelist: [whitelistedIp],
      })
      .expect(201);

    const listViaOtherOrgKey = await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .set('X-Api-Key', otherKeyRes.body.rawKey)
      .set('X-Forwarded-For', whitelistedIp)
      .set('X-Branch-Id', otherBranchId)
      .expect(200);

    // Other org's key sees its own key, never anything from the seed org.
    const otherOrgIds = listViaOtherOrgKey.body.data.map((row: any) => row.id);
    expect(otherOrgIds).toContain(otherKeyRes.body.id);
    expect(otherOrgIds).not.toContain(keyId);

    // Seed org's own list never sees the other org's key either.
    const seedOrgList = await request(app.getHttpServer())
      .get('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);
    const seedOrgIds = seedOrgList.body.data.map((row: any) => row.id);
    expect(seedOrgIds).not.toContain(otherKeyRes.body.id);
  });
});
