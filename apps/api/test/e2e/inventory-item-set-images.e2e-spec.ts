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
import { createUserWithPermissions } from './setup/checkout-saga-fixture';

/**
 * T-01-02 — POST /inventory/items/set-images against a real database
 * (AC-06, AC-09, AC-10): owner type derived from products / ungrouped items
 * of the caller's organization, one body with a product, an orphan item, a
 * foreign-org id and a foreign-org mediaId settling as `updated: 2, failed:
 * 2`, images readable back in order, permission and DTO gates, and
 * idempotent replay. Media goes through the real upload path
 * (`FakeObjectStorageService`) so `syncOwner`'s own checks run for real.
 */
describe('Inventory item bulk set-images (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  const PRODUCT_A = 'aa000000-0000-4000-8000-0000000000a1';
  const VARIANT_A_39 = 'ab000000-0000-4000-8000-0000000000a3';
  const ITEM_C = 'ab000000-0000-4000-8000-0000000000c1';
  const PRODUCT_E = 'aa000000-0000-4000-8000-0000000000e1';
  const VARIANT_E = 'ab000000-0000-4000-8000-0000000000e2';

  const OTHER_ORG = 'e0000000-0000-4000-8000-000000000099';
  let otherOrgItemId: string;
  let otherOrgHeaders: Record<string, string>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    const product = (id: string, code: string) =>
      ds.query(
        `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $3, $4::uuid, NOW(), NOW())`,
        [id, org, code, by],
      );
    const item = (id: string, productId: string | null, code: string, orgId = org) =>
      ds.query(
        `INSERT INTO items (id, organization_id, product_id, code, name, unit,
           purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, 'pcs', 1000, 2000, true, true, $5::uuid, NOW(), NOW())`,
        [id, orgId, productId, code, by],
      );

    await product(PRODUCT_A, 'SETIMG-A');
    await item(VARIANT_A_39, PRODUCT_A, 'SETIMG-A-39');
    await item(ITEM_C, null, 'SETIMG-C');
    await product(PRODUCT_E, 'SETIMG-E');
    await item(VARIANT_E, PRODUCT_E, 'SETIMG-E-M');

    // Second organization with its own inventory.write user, so it can mint a
    // mediaId of its own that the seeded org must not be able to attach.
    otherOrgHeaders = await seedOtherOrg();
    otherOrgItemId = randomUUID();
    await item(otherOrgItemId, null, 'SETIMG-OTHER', OTHER_ORG);
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function headers(): Record<string, string> {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  async function seedOtherOrg(): Promise<Record<string, string>> {
    const branchId = randomUUID();
    const userId = randomUUID();
    const roleId = randomUUID();
    const email = `e2e-other-org-${userId}@test.com`;
    const passwordHash = await bcrypt.hash('password123', 10);

    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Other Org', $2, 'ACTIVE', $3::uuid, NOW(), NOW())`,
      [OTHER_ORG, email, userId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())`,
      [branchId, OTHER_ORG, userId],
    );
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'Other', 'Org', true, NOW(), NOW())`,
      [userId, OTHER_ORG, email, passwordHash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'other-org-inventory', 'E2E other-org role', NOW(), NOW())`,
      [roleId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
      [userId, roleId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
      [userId, branchId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = 'inventory.write'
       ON CONFLICT DO NOTHING`,
      [roleId],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123', organizationId: OTHER_ORG })
      .expect(200);
    return {
      Authorization: authHeader(login.body.accessToken),
      'X-Branch-Id': branchId,
    };
  }

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

  const setImages = (
    assignments: Array<{ id: string; imageIds: string[] }>,
    hdrs: Record<string, string> = headers(),
  ) =>
    request(app.getHttpServer())
      .post('/inventory/items/set-images')
      .set(hdrs)
      .send({ assignments });

  const mediaRow = (mediaId: string) =>
    ds
      .query<Array<{ status: string; ownerId: string | null; ownerType: string | null }>>(
        'SELECT status, owner_id AS "ownerId", owner_type AS "ownerType" FROM media_objects WHERE id = $1::uuid',
        [mediaId],
      )
      .then((r) => r[0]);

  it('AC-06/AC-09: one body settles a product, an orphan item, a foreign id and a foreign mediaId as updated 2 / failed 2', async () => {
    const a1 = await uploadAndComplete(headers(), 'PRODUCT', 'a-1.jpg');
    const a2 = await uploadAndComplete(headers(), 'PRODUCT', 'a-2.jpg');
    const c1 = await uploadAndComplete(headers(), 'ITEM', 'c-1.jpg');
    const mine = await uploadAndComplete(headers(), 'ITEM', 'mine.jpg');
    const foreign = await uploadAndComplete(otherOrgHeaders, 'PRODUCT', 'foreign.jpg');

    const res = await setImages([
      { id: PRODUCT_A, imageIds: [a1, a2] },
      { id: ITEM_C, imageIds: [c1] },
      { id: otherOrgItemId, imageIds: [mine] },
      { id: PRODUCT_E, imageIds: [foreign] },
    ]).expect(200);

    expect(res.body).toEqual({
      updated: [
        { id: PRODUCT_A, code: 'SETIMG-A', imageCount: 2 },
        { id: ITEM_C, code: 'SETIMG-C', imageCount: 1 },
      ],
      failed: [
        { id: otherOrgItemId, code: null, reason: 'OWNER_NOT_FOUND' },
        { id: PRODUCT_E, code: 'SETIMG-E', reason: 'MEDIA_NOT_FOUND' },
      ],
    });

    // Owner type came from the record: a PRODUCT for A, an ITEM for C.
    expect(await mediaRow(a1)).toEqual({ status: 'ATTACHED', ownerId: PRODUCT_A, ownerType: 'PRODUCT' });
    expect(await mediaRow(c1)).toEqual({ status: 'ATTACHED', ownerId: ITEM_C, ownerType: 'ITEM' });
    // The rows that failed left their media exactly where it was.
    expect(await mediaRow(mine)).toMatchObject({ status: 'UPLOADED', ownerId: null });
    expect(await mediaRow(foreign)).toMatchObject({ status: 'UPLOADED', ownerId: null });

    // The record reads back its images in the order they were sent.
    const getA = await request(app.getHttpServer())
      .get(`/admin/entities/inventory-items/records/${PRODUCT_A}`)
      .set(headers())
      .expect(200);
    expect(getA.body.images.map((image: { id: string }) => image.id)).toEqual([a1, a2]);
  });

  it('AC-09: a variant id is OWNER_NOT_FOUND — the client must send the product id', async () => {
    const m = await uploadAndComplete(headers(), 'PRODUCT', 'variant.jpg');
    const res = await setImages([{ id: VARIANT_A_39, imageIds: [m] }]).expect(200);
    expect(res.body).toEqual({
      updated: [],
      failed: [{ id: VARIANT_A_39, code: null, reason: 'OWNER_NOT_FOUND' }],
    });
    expect(await mediaRow(m)).toMatchObject({ status: 'UPLOADED', ownerId: null });
  });

  it('AC-06: a full replace detaches what is no longer listed and an empty list clears the set', async () => {
    const before = await request(app.getHttpServer())
      .get(`/admin/entities/inventory-items/records/${PRODUCT_A}`)
      .set(headers())
      .expect(200);
    const [keep, drop] = before.body.images.map((image: { id: string }) => image.id);
    const fresh = await uploadAndComplete(headers(), 'PRODUCT', 'a-3.jpg');

    const res = await setImages([{ id: PRODUCT_A, imageIds: [fresh, keep] }]).expect(200);
    expect(res.body.updated).toEqual([{ id: PRODUCT_A, code: 'SETIMG-A', imageCount: 2 }]);
    expect((await mediaRow(drop)).status).toBe('DELETED');

    const after = await request(app.getHttpServer())
      .get(`/admin/entities/inventory-items/records/${PRODUCT_A}`)
      .set(headers())
      .expect(200);
    expect(after.body.images.map((image: { id: string }) => image.id)).toEqual([fresh, keep]);

    const cleared = await setImages([{ id: ITEM_C, imageIds: [] }]).expect(200);
    expect(cleared.body.updated).toEqual([{ id: ITEM_C, code: 'SETIMG-C', imageCount: 0 }]);
  });

  it('AC-10: an account with only inventory.read gets 403', async () => {
    const reader = await createUserWithPermissions(app, seed, ['inventory.read']);
    await setImages([{ id: PRODUCT_A, imageIds: [] }], reader.headers()).expect(403);
  });

  it('rejects ownerType in the body, more than 50 assignments and more than 10 imageIds (400)', async () => {
    await request(app.getHttpServer())
      .post('/inventory/items/set-images')
      .set(headers())
      .send({ assignments: [{ id: PRODUCT_A, ownerType: 'PRODUCT', imageIds: [] }] })
      .expect(400);

    await setImages(
      Array.from({ length: 51 }, () => ({ id: PRODUCT_A, imageIds: [] })),
    ).expect(400);

    await setImages([
      { id: PRODUCT_A, imageIds: Array.from({ length: 11 }, () => randomUUID()) },
    ]).expect(400);

    await setImages([]).expect(400);
    await setImages([{ id: 'not-a-uuid', imageIds: [] }]).expect(400);
  });

  it('replays a repeated request with the same idempotency key instead of writing twice', async () => {
    const m = await uploadAndComplete(headers(), 'ITEM', 'idem.jpg');
    const key = `e2e-set-images-${randomUUID()}`;
    const send = () =>
      request(app.getHttpServer())
        .post('/inventory/items/set-images')
        .set({ ...headers(), 'X-Idempotency-Key': key })
        .send({ assignments: [{ id: ITEM_C, imageIds: [m] }] });

    const first = await send().expect(200);
    expect(first.body.updated).toEqual([{ id: ITEM_C, code: 'SETIMG-C', imageCount: 1 }]);

    // Detach behind the API's back; a genuine second write would re-attach,
    // a replay leaves the row alone.
    await ds.query(
      `UPDATE media_objects SET status = 'UPLOADED', owner_id = NULL WHERE id = $1::uuid`,
      [m],
    );

    const second = await send().expect(200);
    expect(second.headers['x-idempotency-status']).toBe('REPLAYED');
    expect(second.body).toEqual(first.body);
    expect(await mediaRow(m)).toMatchObject({ status: 'UPLOADED', ownerId: null });
  });
});
