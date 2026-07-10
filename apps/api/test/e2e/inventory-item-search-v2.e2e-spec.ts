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
 * E2E for POST /v2/inventory-items/search — the self-contained product-grouped
 * search (does NOT reuse listProductGroups). Verifies grouping, the joined
 * barcode column, averaged prices, the per-column filters (string / compare /
 * boolean), org-scoping, pagination and validation.
 */
describe('Inventory item grouped search v2 (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const OTHER_ORG = 'e0000000-0000-4000-8000-000000000099';
  const PRODUCT_ID = 'aa000000-0000-4000-8000-000000000001';
  const V1 = 'ab000000-0000-4000-8000-000000000001';
  const V2 = 'ab000000-0000-4000-8000-000000000002';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    const org = seed.organizationId;
    const by = seed.userId;

    // Product "Giày Gelli" with two variants + a barcode each.
    await ds.query(
      `INSERT INTO products (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'GELLI', 'Giày Gelli', $3::uuid, NOW(), NOW())`,
      [PRODUCT_ID, org, by],
    );
    const variant = (id: string, code: string, purchase: number, selling: number) =>
      ds.query(
        `INSERT INTO items (id, organization_id, product_id, code, name, unit, brand,
           purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $4, 'đôi', 'Acme', $5, $6, true, true, $7::uuid, NOW(), NOW())`,
        [id, org, PRODUCT_ID, code, purchase, selling, by],
      );
    await variant(V1, 'GELLI-39', 300000, 500000);
    await variant(V2, 'GELLI-40', 400000, 700000);
    await ds.query(
      `INSERT INTO item_barcodes (id, organization_id, item_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'BC-39', $3::uuid, NOW(), NOW()),
              (gen_random_uuid(), $1::uuid, $4::uuid, 'BC-40', $3::uuid, NOW(), NOW())`,
      [org, V1, by, V2],
    );

    // Orphan item (no product, no barcode), inactive.
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, purchase_price, selling_price,
         is_active, is_pos_visible, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'LAPTOP-15', 'Laptop 15', 'pcs', 1000000, 1500000,
         false, true, $2::uuid, NOW(), NOW())`,
      [org, by],
    );

    // Cross-tenant item — must never appear in the seeded org's results.
    await ds.query(
      `INSERT INTO items (id, organization_id, code, name, unit, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, 'IIS-OTHER-ORG', 'Other Org', 'pcs', $2::uuid, NOW(), NOW())`,
      [OTHER_ORG, by],
    );
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function search(body: Record<string, unknown>) {
    return request(app.getHttpServer())
      .post('/v2/inventory-items/search')
      .set(headers())
      .send(body);
  }

  const codesOf = (body: { data: Array<{ code: string }> }) =>
    body.data.map((r) => r.code);

  it('groups variants per product, joins barcodes, averages prices; envelope {data,total,page,limit}, org-scoped; hides discontinued by default', async () => {
    const res = await search({}).expect(201);

    // Default-hide: the inactive orphan LAPTOP-15 is excluded, leaving only GELLI.
    expect(res.body).toMatchObject({ page: 1, limit: 20, total: 1 });
    // Sorted by code ASC; cross-tenant row excluded.
    expect(codesOf(res.body)).toEqual(['GELLI']);

    expect(res.body.data[0]).toMatchObject({
      type: 'product',
      id: PRODUCT_ID,
      code: 'GELLI',
      name: 'Giày Gelli',
      barcode: 'BC-39, BC-40',
      unit: 'đôi',
      brand: 'Acme',
      purchasePrice: 350000,
      sellingPrice: 600000,
      isPosVisible: true,
      isActive: true,
      itemCount: 2,
    });
  });

  it('includes discontinued items when includeInactive=true', async () => {
    const res = await search({ includeInactive: true }).expect(201);

    expect(res.body.total).toBe(2);
    expect(codesOf(res.body)).toEqual(['GELLI', 'LAPTOP-15']);
    expect(res.body.data[1]).toMatchObject({
      type: 'orphan',
      code: 'LAPTOP-15',
      barcode: '',
      itemCount: 0,
      isActive: false,
    });
  });

  it('filters by barcode (contains)', async () => {
    const res = await search({
      barcode: { operator: '*', value: 'BC-40' },
    }).expect(201);
    expect(codesOf(res.body)).toEqual(['GELLI']);
  });

  it('filters by brand (contains, case-insensitive)', async () => {
    const res = await search({
      brand: { operator: '*', value: 'acme' },
    }).expect(201);
    expect(codesOf(res.body)).toEqual(['GELLI']);
  });

  it('filters by name (contains)', async () => {
    const res = await search({
      name: { operator: '*', value: 'laptop' },
      includeInactive: true,
    }).expect(201);
    expect(codesOf(res.body)).toEqual(['LAPTOP-15']);
  });

  it('filters by purchasePrice (<=) on the averaged value', async () => {
    const res = await search({
      purchasePrice: { operator: '<=', value: 350000 },
    }).expect(201);
    expect(codesOf(res.body)).toEqual(['GELLI']);
  });

  it('filters by isActive explicitly (bypasses default-hide)', async () => {
    const res = await search({ isActive: false }).expect(201);
    expect(codesOf(res.body)).toEqual(['LAPTOP-15']);
  });

  it('returns only inactive when includeInactive=true and isActive=false', async () => {
    const res = await search({ includeInactive: true, isActive: false }).expect(
      201,
    );
    expect(codesOf(res.body)).toEqual(['LAPTOP-15']);
  });

  it('paginates', async () => {
    const p1 = await search({
      page: 1,
      limit: 1,
      includeInactive: true,
    }).expect(201);
    expect(codesOf(p1.body)).toEqual(['GELLI']);
    expect(p1.body.total).toBe(2);
    const p2 = await search({
      page: 2,
      limit: 1,
      includeInactive: true,
    }).expect(201);
    expect(codesOf(p2.body)).toEqual(['LAPTOP-15']);
  });

  it('rejects pageSize over the max and unknown fields (400)', async () => {
    await search({ limit: 101 }).expect(400);
    await search({ bogusField: 'x' }).expect(400);
  });
});
