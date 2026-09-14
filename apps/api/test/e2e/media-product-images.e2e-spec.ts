import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
  fakeObjectStorage,
} from './setup/test-app';

/**
 * T-02-03 — proves images travel the whole HTTP → DB → response path for the
 * generic `inventory-items` CRUD entity (AC-01), and that an `imageIds` entry
 * from another organization is rejected instead of crossing the tenant
 * boundary (AC-08). `MediaLinkService.applySync` filters candidate media rows
 * by the caller's own `organizationId`, so a foreign-org id simply never
 * matches and comes back as `MEDIA_NOT_FOUND` — this is what pins that down.
 */
describe('Media on product/item images via CRUD (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function uploadAndComplete(
    hdrs: Record<string, string>,
    ownerType: 'PRODUCT' | 'ITEM',
    fileName: string,
  ): Promise<string> {
    const ticketRes = await request(app.getHttpServer())
      .post('/media/uploads')
      .set(hdrs)
      .send({ ownerType, fileName, contentType: 'image/jpeg', size: 1024 })
      .expect(201);

    const mediaId: string = ticketRes.body.mediaId;
    const objectKey: string = ticketRes.body.upload.fields.key;
    fakeObjectStorage.putFake(objectKey, 1024, 'image/jpeg');

    await request(app.getHttpServer())
      .post(`/media/uploads/${mediaId}/complete`)
      .set(hdrs)
      .expect(200);

    return mediaId;
  }

  it('AC-01: PRODUCT with colors/sizes attaches imageIds and GET returns them in order', async () => {
    const mediaA = await uploadAndComplete(headers(), 'PRODUCT', 'anh-a.jpg');
    const mediaB = await uploadAndComplete(headers(), 'PRODUCT', 'anh-b.jpg');

    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/inventory-items/records')
      .set(headers())
      .send({
        name: 'Giay The Thao E2E',
        unit: 'Đôi',
        purchasePrice: 100000,
        sellingPrice: 200000,
        colors: ['Đen', 'Trắng'],
        sizes: ['39', '40'],
        imageIds: [mediaA, mediaB],
      })
      .expect(201);

    const productId = createRes.body.productId;
    expect(productId).toBeDefined();

    const getRes = await request(app.getHttpServer())
      .get(`/admin/entities/inventory-items/records/${productId}`)
      .set(headers())
      .expect(200);

    expect(getRes.body.images).toHaveLength(2);
    expect(getRes.body.images.map((image: { id: string }) => image.id)).toEqual([
      mediaA,
      mediaB,
    ]);
  });

  it('AC-01: ITEM without variants attaches imageIds and GET returns them in order', async () => {
    const mediaA = await uploadAndComplete(headers(), 'ITEM', 'anh-item-a.jpg');
    const mediaB = await uploadAndComplete(headers(), 'ITEM', 'anh-item-b.jpg');

    const createRes = await request(app.getHttpServer())
      .post('/admin/entities/inventory-items/records')
      .set(headers())
      .send({
        code: 'ITEM-IMG-001',
        name: 'Standalone Item E2E',
        unit: 'PCS',
        purchasePrice: 10000,
        sellingPrice: 20000,
        imageIds: [mediaA, mediaB],
      })
      .expect(201);

    const itemId = createRes.body.id;
    expect(itemId).toBeDefined();

    const getRes = await request(app.getHttpServer())
      .get(`/admin/entities/inventory-items/records/${itemId}`)
      .set(headers())
      .expect(200);

    expect(getRes.body.images).toHaveLength(2);
    expect(getRes.body.images.map((image: { id: string }) => image.id)).toEqual([
      mediaA,
      mediaB,
    ]);
  });

  describe('AC-08: organization isolation', () => {
    let otherOrgHeaders: () => Record<string, string>;

    beforeAll(async () => {
      // No existing e2e helper builds a second organization (checkout-saga-fixture's
      // createUserWithPermissions only adds a user inside the *same* org as its
      // `base` argument), so this is built here per T-02-03's implementation notes
      // rather than touching test-app.ts.
      const otherOrgId = randomUUID();
      const otherBranchId = randomUUID();
      const otherUserId = randomUUID();
      const otherRoleId = randomUUID();
      const email = `e2e-other-org-${otherUserId}@test.com`;
      const passwordHash = await bcrypt.hash('password123', 10);

      await ds.query(
        `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
         VALUES ($1::uuid, $1::uuid, 'Other Org', $2, 'ACTIVE', $3::uuid, NOW(), NOW())`,
        [otherOrgId, email, otherUserId],
      );
      await ds.query(
        `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())`,
        [otherBranchId, otherOrgId, otherUserId],
      );
      await ds.query(
        `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'Other', 'Org', true, NOW(), NOW())`,
        [otherUserId, otherOrgId, email, passwordHash],
      );
      await ds.query(
        `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, 'other-org-inventory', 'E2E other-org role', NOW(), NOW())`,
        [otherRoleId, otherOrgId],
      );
      await ds.query(
        `INSERT INTO user_roles (id, user_id, role_id, organization_id)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
        [otherUserId, otherRoleId, otherOrgId],
      );
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
        [otherUserId, otherBranchId, otherOrgId],
      );

      // Needs inventory.write to reach InventoryItemCrudService.create at all
      // (CrudPermissionGuard) — without it the request would 403 before ever
      // resolving the mediaId, which would not prove anything about isolation.
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), 'inventory.write', 'inventory.write', 'inventory')
         ON CONFLICT DO NOTHING`,
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = 'inventory.write'
         ON CONFLICT DO NOTHING`,
        [otherRoleId],
      );

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'password123', organizationId: otherOrgId })
        .expect(200);
      const accessToken: string = login.body.accessToken;

      otherOrgHeaders = () => ({
        Authorization: authHeader(accessToken),
        'X-Branch-Id': otherBranchId,
      });
    });

    it('rejects a foreign-org mediaId with 404 and leaves the media UPLOADED and unattached', async () => {
      const mediaId = await uploadAndComplete(headers(), 'ITEM', 'anh-cross-org.jpg');

      const res = await request(app.getHttpServer())
        .post('/admin/entities/inventory-items/records')
        .set(otherOrgHeaders())
        .send({
          code: 'CROSS-ORG-ITEM',
          name: 'Cross Org Item',
          unit: 'PCS',
          purchasePrice: 1000,
          sellingPrice: 2000,
          imageIds: [mediaId],
        })
        .expect(404);

      expect(res.body.code).toBe('MEDIA_NOT_FOUND');

      const mediaRows = await ds.query(
        'SELECT status, owner_id AS "ownerId" FROM media_objects WHERE id = $1',
        [mediaId],
      );
      expect(mediaRows[0].status).toBe('UPLOADED');
      expect(mediaRows[0].ownerId).toBeNull();

      const itemRows = await ds.query(
        "SELECT count(*)::int AS c FROM items WHERE code = 'CROSS-ORG-ITEM'",
      );
      expect(itemRows[0].c).toBe(0);
    });
  });
});
