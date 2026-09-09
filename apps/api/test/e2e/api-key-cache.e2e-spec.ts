import { INestApplication } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { ApiKeyAuthService } from '../../src/modules/api-key/api-key-auth.service';
import { ApiKeyEntity } from '../../src/modules/api-key/api-key.entity';
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

// Same reasoning as the other two api-key e2e specs: seedBaseData()'s role
// predates this feature and RbacService caches resolved permissions for
// 300s across e2e runs — grant and invalidate explicitly.
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

describe('ApiKeyAuthService caching (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let apiKeyAuth: ApiKeyAuthService;
  let apiKeyRepo: Repository<ApiKeyEntity>;
  const whitelistedIp = '203.0.113.5';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await grantApiKeyPermissions(app);

    apiKeyAuth = app.get(ApiKeyAuthService);
    apiKeyRepo = app.get(getRepositoryToken(ApiKeyEntity));
  });

  afterAll(async () => {
    await app.close();
  });

  it('AC-11: a second validate() call with the same key skips the DB lookup entirely', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Cache hit test key',
        roles: [SEEDED_ROLE_ID],
        ipWhitelist: [whitelistedIp],
      })
      .expect(201);
    const rawKey = createRes.body.rawKey;

    const findOneSpy = jest.spyOn(apiKeyRepo, 'findOne');

    const first = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(first.kind).toBe('ok');
    expect(findOneSpy).toHaveBeenCalledTimes(1);

    const second = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(second.kind).toBe('ok');
    // Served from cache — no second DB lookup.
    expect(findOneSpy).toHaveBeenCalledTimes(1);

    findOneSpy.mockRestore();
  });

  it('AC-07/AC-12: revoking a key busts the cache immediately, no TTL wait', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Revoke-invalidates test key',
        roles: [SEEDED_ROLE_ID],
        ipWhitelist: [whitelistedIp],
      })
      .expect(201);
    const rawKey = createRes.body.rawKey;
    const keyId = createRes.body.id;

    // Prime the cache — mirrors real traffic before the key is revoked.
    const beforeRevoke = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(beforeRevoke.kind).toBe('ok');

    await request(app.getHttpServer())
      .delete(`/admin/entities/api-keys/records/${keyId}`)
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .expect(200);

    // Immediately — not "after the 60s TTL" — the same raw key must fail.
    const afterRevoke = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(afterRevoke.kind).toBe('not_found');
  });

  it('AC-12: editing ipWhitelist also busts the cache immediately', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/api-keys/records')
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({
        name: 'Edit-invalidates test key',
        roles: [SEEDED_ROLE_ID],
        ipWhitelist: [whitelistedIp],
      })
      .expect(201);
    const rawKey = createRes.body.rawKey;
    const keyId = createRes.body.id;

    const beforeEdit = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(beforeEdit.kind).toBe('ok');

    const newIp = '198.51.100.9';
    await request(app.getHttpServer())
      .patch(`/admin/entities/api-keys/records/${keyId}`)
      .set('Authorization', authHeader(seed.accessToken))
      .set('X-Branch-Id', seed.branchId)
      .send({ ipWhitelist: [newIp] })
      .expect(200);

    // The OLD whitelisted IP must be rejected now — a stale cache would still say ok.
    const afterEditOldIp = await apiKeyAuth.validate(rawKey, whitelistedIp);
    expect(afterEditOldIp.kind).toBe('ip_denied');

    const afterEditNewIp = await apiKeyAuth.validate(rawKey, newIp);
    expect(afterEditNewIp.kind).toBe('ok');
  });
});
