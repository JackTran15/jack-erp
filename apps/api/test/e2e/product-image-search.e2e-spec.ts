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
 * T-01-01 — POST /v2/inventory-items/images/search against a real database:
 * image status (AC-02, AC-03), category subtree with the group's category
 * read from its variants (AC-04), keyword on group code / name / variant
 * code (AC-05), the `inventory.read` permission (AC-06), and organization
 * isolation. Images are attached through the real upload path
 * (`FakeObjectStorageService`) and the CRUD `imageIds` patch, so the
 * ATTACHED count and `thumbnailUrl` are proven end to end.
 */
describe('Product image search v2 (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  const CAT_SHOES = 'ca000000-0000-4000-8000-000000000001'; // parent
  const CAT_WOMEN = 'ca000000-0000-4000-8000-000000000002'; // child of SHOES
  const CAT_SPORT = 'ca000000-0000-4000-8000-000000000003'; // child of SHOES
  const CAT_GIFTS = 'ca000000-0000-4000-8000-000000000009'; // separate root

  const PRODUCT_A = 'aa000000-0000-4000-8000-00000000000a';
  const VARIANT_A_39 = 'ab000000-0000-4000-8000-00000000003a';
  const VARIANT_A_40 = 'ab000000-0000-4000-8000-00000000004a';
  const ITEM_B = 'ab000000-0000-4000-8000-00000000000b';
  const ITEM_C = 'ab000000-0000-4000-8000-00000000000c';
  const ITEM_D_INACTIVE = 'ab000000-0000-4000-8000-00000000000d';
  const PRODUCT_E = 'aa000000-0000-4000-8000-00000000000e';
  const VARIANT_E = 'ab000000-0000-4000-8000-00000000000e';

  const OTHER_ORG = 'e0000000-0000-4000-8000-000000000099';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    const category = (id: string, name: string, parentId: string | null) =>
      ds.query(
        `INSERT INTO inventory_item_categories (id, organization_id, name, status, parent_group_id, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, 'ACTIVE', $4::uuid, $5::uuid, NOW(), NOW())`,
        [id, org, name, parentId, by],
      );
    await category(CAT_SHOES, 'GIAY DEP', null);
    await category(CAT_WOMEN, 'Giay nu', CAT_SHOES);
    await category(CAT_SPORT, 'Giay the thao', CAT_SHOES);
    await category(CAT_GIFTS, 'QUA TANG', null);

    const product = (id: string, code: string, name: string) =>
      ds.query(
        `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid, NOW(), NOW())`,
        [id, org, code, name, by],
      );
    const item = (
      id: string,
      productId: string | null,
      code: string,
      name: string,
      categoryId: string | null,
      isActive = true,
    ) =>
      ds.query(
        `INSERT INTO items (id, organization_id, product_id, code, name, unit, category_id,
           purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'pcs', $6::uuid, 1000, 2000, $7, true, $8::uuid, NOW(), NOW())`,
        [id, org, productId, code, name, categoryId, isActive, by],
      );

    // A: product with two variants in "Giay nu" — gets 2 PRODUCT images.
    await product(PRODUCT_A, 'AAA-MEDIA-A', 'Giay A');
    await item(VARIANT_A_39, PRODUCT_A, 'AAA-MEDIA-A-DEN-39', 'Giay A Den 39', CAT_WOMEN);
    await item(VARIANT_A_40, PRODUCT_A, 'AAA-MEDIA-A-DEN-40', 'Giay A Den 40', CAT_WOMEN);
    // B: orphan item in "QUA TANG" — gets 1 ITEM image.
    await item(ITEM_B, null, 'AAA-MEDIA-B', 'Tui qua B', CAT_GIFTS);
    // C: orphan item in "Giay the thao" — no image.
    await item(ITEM_C, null, 'AAA-MEDIA-C', 'Giay chay C', CAT_SPORT);
    // D: inactive orphan, no image — must never be listed (A-13).
    await item(ITEM_D_INACTIVE, null, 'AAA-MEDIA-D', 'Ngung kinh doanh D', CAT_SPORT, false);
    // E: product without a category — categoryName null, no image.
    await product(PRODUCT_E, 'AAA-MEDIA-E', 'Mu E');
    await item(VARIANT_E, PRODUCT_E, 'AAA-MEDIA-E-M', 'Mu E size M', null);

    // Cross-tenant orphan with no image — must never appear for the seeded org.
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'AAA-MEDIA-OTHER', 'Other Org', 'pcs', $2::uuid, NOW(), NOW())`,
      [OTHER_ORG, by],
    );

    const mediaA1 = await uploadAndComplete(headers(), 'PRODUCT', 'a-1.jpg');
    const mediaA2 = await uploadAndComplete(headers(), 'PRODUCT', 'a-2.jpg');
    await request(app.getHttpServer())
      .patch(`/admin/entities/inventory-items/records/${PRODUCT_A}`)
      .set(headers())
      .send({ imageIds: [mediaA1, mediaA2] })
      .expect(200);

    const mediaB1 = await uploadAndComplete(headers(), 'ITEM', 'b-1.jpg');
    await request(app.getHttpServer())
      .patch(`/admin/entities/inventory-items/records/${ITEM_B}`)
      .set(headers())
      .send({ imageIds: [mediaB1] })
      .expect(200);
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

  function search(
    body: Record<string, unknown>,
    hdrs: Record<string, string> = headers(),
  ) {
    return request(app.getHttpServer())
      .post('/v2/inventory-items/images/search')
      .set(hdrs)
      .send(body);
  }

  const codesOf = (body: { data: Array<{ code: string }> }) =>
    body.data.map((r) => r.code);

  it('AC-02: defaults to MISSING — active groups without an ATTACHED image, code ASC, placeholder thumbnails', async () => {
    const res = await search({}).expect(200);

    expect(res.body).toMatchObject({ page: 1, limit: 50, total: 2 });
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-C', 'AAA-MEDIA-E']);
    expect(res.body.data[0]).toEqual({
      type: 'orphan',
      id: ITEM_C,
      code: 'AAA-MEDIA-C',
      name: 'Giay chay C',
      categoryName: 'Giay the thao',
      imageCount: 0,
      thumbnailUrl: null,
    });
    expect(res.body.data[1]).toMatchObject({
      type: 'product',
      id: PRODUCT_E,
      categoryName: null,
      imageCount: 0,
      thumbnailUrl: null,
    });
  });

  it('AC-03: PRESENT returns only A and B with the first image as thumbnail', async () => {
    const res = await search({ imageStatus: 'PRESENT' }).expect(200);

    expect(res.body.total).toBe(2);
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-A', 'AAA-MEDIA-B']);

    const [a, b] = res.body.data;
    expect(a).toMatchObject({
      type: 'product',
      id: PRODUCT_A,
      name: 'Giay A',
      categoryName: 'Giay nu',
      imageCount: 2,
    });
    expect(typeof a.thumbnailUrl).toBe('string');
    expect(a.thumbnailUrl).toMatch(/\/org\/[0-9a-f-]+\/product\/[0-9a-f-]+$/);
    expect(b).toMatchObject({
      type: 'orphan',
      id: ITEM_B,
      categoryName: 'QUA TANG',
      imageCount: 1,
    });
    expect(b.thumbnailUrl).toMatch(/\/org\/[0-9a-f-]+\/item\/[0-9a-f-]+$/);

    // Only the URL is copied out of the media lookup.
    for (const row of res.body.data) {
      expect(Object.keys(row).sort()).toEqual(
        ['categoryName', 'code', 'id', 'imageCount', 'name', 'thumbnailUrl', 'type'],
      );
    }
  });

  it('AC-03: ALL lists every active group — with and without images — and hides inactive ones', async () => {
    const res = await search({ imageStatus: 'ALL' }).expect(200);

    expect(res.body.total).toBe(4);
    expect(codesOf(res.body)).toEqual([
      'AAA-MEDIA-A',
      'AAA-MEDIA-B',
      'AAA-MEDIA-C',
      'AAA-MEDIA-E',
    ]);
    expect(res.body.data.map((r: { imageCount: number }) => r.imageCount)).toEqual([2, 1, 0, 0]);
    expect(res.body.data.map((r: { thumbnailUrl: string | null }) => r.thumbnailUrl !== null)).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it('AC-04: a parent category includes groups of every child category; the product category comes from its variants', async () => {
    const res = await search({ imageStatus: 'ALL', categoryId: CAT_SHOES }).expect(200);

    // A via "Giay nu", C via "Giay the thao"; B ("QUA TANG") and E (none) excluded.
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-A', 'AAA-MEDIA-C']);
    expect(res.body.total).toBe(2);
    expect(res.body.data[0].categoryName).toBe('Giay nu');
  });

  it('AC-04: a leaf category matches only its own groups', async () => {
    const res = await search({ imageStatus: 'ALL', categoryId: CAT_WOMEN }).expect(200);
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-A']);
  });

  it('AC-04: a category id outside the organization yields 0 results, not 404', async () => {
    const res = await search({ imageStatus: 'ALL', categoryId: randomUUID() }).expect(200);
    expect(res.body).toMatchObject({ data: [], total: 0 });
  });

  it('AC-05: keyword matches a variant code, case-insensitively', async () => {
    const res = await search({ imageStatus: 'ALL', keyword: 'media-a-den' }).expect(200);
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-A']);
  });

  it('AC-05: keyword matches the group name and the group code', async () => {
    const byName = await search({ imageStatus: 'ALL', keyword: 'tui qua' }).expect(200);
    expect(codesOf(byName.body)).toEqual(['AAA-MEDIA-B']);

    const byCode = await search({ imageStatus: 'ALL', keyword: 'aaa-media-c' }).expect(200);
    expect(codesOf(byCode.body)).toEqual(['AAA-MEDIA-C']);
  });

  it('AC-05: keyword wildcards are literal', async () => {
    const res = await search({ imageStatus: 'ALL', keyword: '%' }).expect(200);
    expect(res.body.total).toBe(0);
  });

  it('ANDs image status, category and keyword; count matches the page', async () => {
    const res = await search({
      imageStatus: 'MISSING',
      categoryId: CAT_SHOES,
      keyword: 'giay',
      page: 1,
      limit: 1,
    }).expect(200);
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-C']);
    expect(res.body.total).toBe(1);
  });

  it('paginates', async () => {
    const p1 = await search({ imageStatus: 'ALL', page: 1, limit: 3 }).expect(200);
    expect(codesOf(p1.body)).toEqual(['AAA-MEDIA-A', 'AAA-MEDIA-B', 'AAA-MEDIA-C']);
    expect(p1.body.total).toBe(4);
    const p2 = await search({ imageStatus: 'ALL', page: 2, limit: 3 }).expect(200);
    expect(codesOf(p2.body)).toEqual(['AAA-MEDIA-E']);
  });

  it('rejects an invalid imageStatus, limit over 100, a non-uuid categoryId and unknown fields (400)', async () => {
    await search({ imageStatus: 'SOME' }).expect(400);
    await search({ limit: 101 }).expect(400);
    await search({ categoryId: 'not-a-uuid' }).expect(400);
    await search({ includeInactive: true }).expect(400);
  });

  it('AC-06: an account with only inventory.read gets 200', async () => {
    const reader = await createUserWithPermissions(app, seed, ['inventory.read']);
    const res = await search({ imageStatus: 'ALL' }, reader.headers()).expect(200);
    expect(res.body.total).toBe(4);
  });

  it('AC-06: an account without inventory.read gets 403', async () => {
    const noRead = await createUserWithPermissions(app, seed, ['inventory.write']);
    await search({}, noRead.headers()).expect(403);
  });

  it('another organization sees none of these groups', async () => {
    const otherBranchId = randomUUID();
    const otherUserId = randomUUID();
    const otherRoleId = randomUUID();
    const email = `e2e-other-org-${otherUserId}@test.com`;
    const passwordHash = await bcrypt.hash('password123', 10);

    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Other Org', $2, 'ACTIVE', $3::uuid, NOW(), NOW())`,
      [OTHER_ORG, email, otherUserId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())`,
      [otherBranchId, OTHER_ORG, otherUserId],
    );
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3, $4, 'Other', 'Org', true, NOW(), NOW())`,
      [otherUserId, OTHER_ORG, email, passwordHash],
    );
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'other-org-inventory', 'E2E other-org role', NOW(), NOW())`,
      [otherRoleId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid)`,
      [otherUserId, otherRoleId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
      [otherUserId, otherBranchId, OTHER_ORG],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = 'inventory.read'
       ON CONFLICT DO NOTHING`,
      [otherRoleId],
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123', organizationId: OTHER_ORG })
      .expect(200);
    const otherHeaders = {
      Authorization: authHeader(login.body.accessToken),
      'X-Branch-Id': otherBranchId,
    };

    const res = await search({ imageStatus: 'ALL' }, otherHeaders).expect(200);
    expect(codesOf(res.body)).toEqual(['AAA-MEDIA-OTHER']);
    expect(res.body.total).toBe(1);

    // And the seeded org never sees the other org's item.
    const own = await search({ imageStatus: 'ALL' }).expect(200);
    expect(codesOf(own.body)).not.toContain('AAA-MEDIA-OTHER');
  });
});
