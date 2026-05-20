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
 * E2E for GET /inventory/stock/summary — the storage-grained aggregation used
 * by the "Tổng hợp tồn kho" page. Validates:
 *   - aggregation across multiple locations within the same storage
 *   - separate rows for the same item across different storages
 *   - cross-org isolation
 *   - filters: branchId, storageId, search, brand, movementFrom/movementTo
 *   - pagination (total + totalQuantity reflect entire query, not just page)
 */
describe('Stock Summary API (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let storageAId: string;
  let storageBId: string;
  let locA1Id: string;
  let locA2Id: string;
  let locBId: string;
  let categoryId: string;

  let itemNikeId: string;
  let itemAdidasId: string;
  let itemPumaId: string;

  // Cross-org isolation fixture
  let otherOrgId: string;
  let otherUserId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function createStorage(name: string, branchId: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name, branchId })
      .expect(201);
    return res.body.id;
  }

  async function createLocation(
    code: string,
    storageId: string,
    branchId: string,
  ): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code, type: 'SHELF', storageId, branchId })
      .expect(201);
    return res.body.id;
  }

  async function createCategory(name: string): Promise<string> {
    const rows = await ds.query<Array<{ id: string }>>(
      `INSERT INTO inventory_item_categories
        (id, organization_id, name, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, NOW(), NOW())
       RETURNING id`,
      [seed.organizationId, name, seed.userId],
    );
    return rows[0].id;
  }

  async function createItem(payload: {
    code: string;
    name: string;
    brand?: string;
    categoryId?: string;
  }): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: payload.code,
        name: payload.name,
        unit: 'Đôi',
        purchasePrice: 50,
        sellingPrice: 100,
        isPosVisible: true,
        isActive: true,
        brand: payload.brand,
        categoryId: payload.categoryId,
      })
      .expect(201);
    return res.body.id;
  }

  async function insertBalance(
    itemId: string,
    locationId: string,
    branchId: string,
    quantity: number,
    lastMovementAt: Date | null = new Date(),
  ): Promise<void> {
    await ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::uuid, NOW(), NOW())
       ON CONFLICT (organization_id, item_id, location_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, last_movement_at = EXCLUDED.last_movement_at`,
      [
        seed.organizationId,
        branchId,
        itemId,
        locationId,
        quantity,
        lastMovementAt,
        seed.userId,
      ],
    );
  }

  async function seedOtherOrg(): Promise<void> {
    otherOrgId = 'a0000000-0000-4000-8000-0000000000FF';
    otherUserId = 'c0000000-0000-4000-8000-0000000000FF';
    const otherBranchId = 'b0000000-0000-4000-8000-0000000000FF';
    const otherStorageId = '11111111-1111-4111-8111-111111111111';
    const otherLocId = '22222222-2222-4222-8222-222222222222';
    const otherItemId = '33333333-3333-4333-8333-333333333333';

    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $1::uuid, 'Other Org', 'other@test.com', 'ACTIVE', $2::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherOrgId, otherUserId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', true, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherBranchId, otherOrgId, otherUserId],
    );
    await ds.query(
      `INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Other WH', true, $4::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherStorageId, otherOrgId, otherBranchId, otherUserId],
    );
    await ds.query(
      `INSERT INTO locations
         (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'OTHER-LOC', 'Other Loc', 'SHELF', true, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherLocId, otherOrgId, otherBranchId, otherStorageId, otherUserId],
    );
    await ds.query(
      `INSERT INTO items
         (id, organization_id, code, name, unit, purchase_price, selling_price, is_active, is_pos_visible, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'OTHER-SKU', 'Other Item', 'pcs', 10, 20, true, true, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherItemId, otherOrgId, otherUserId],
    );
    await ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, 999, NOW(), $5::uuid, NOW(), NOW())`,
      [otherOrgId, otherBranchId, otherItemId, otherLocId, otherUserId],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // 2 storages in the main branch
    storageAId = await createStorage('Kho A', seed.branchId);
    storageBId = await createStorage('Kho B', seed.branchId);

    // 2 locations in storage A, 1 in storage B
    locA1Id = await createLocation('A-01', storageAId, seed.branchId);
    locA2Id = await createLocation('A-02', storageAId, seed.branchId);
    locBId = await createLocation('B-01', storageBId, seed.branchId);

    categoryId = await createCategory('Giày nam');

    itemNikeId = await createItem({
      code: 'NIKE-001',
      name: 'Nike Air',
      brand: 'Nike',
      categoryId,
    });
    itemAdidasId = await createItem({
      code: 'ADIDAS-001',
      name: 'Adidas Boost',
      brand: 'Adidas',
      categoryId,
    });
    itemPumaId = await createItem({
      code: 'PUMA-001',
      name: 'Puma Suede',
      brand: 'Puma',
    });

    const now = new Date();
    const lastYear = new Date(now);
    lastYear.setFullYear(now.getFullYear() - 1);

    // Nike in Kho A: 5 at A-01 + 3 at A-02 → aggregated quantity = 8
    await insertBalance(itemNikeId, locA1Id, seed.branchId, 5, now);
    await insertBalance(itemNikeId, locA2Id, seed.branchId, 3, now);
    // Nike also in Kho B: 12 (separate row in result)
    await insertBalance(itemNikeId, locBId, seed.branchId, 12, now);
    // Adidas only in Kho A: 20 at A-01
    await insertBalance(itemAdidasId, locA1Id, seed.branchId, 20, now);
    // Puma in Kho B with last_movement_at = 1 year ago (date filter target)
    await insertBalance(itemPumaId, locBId, seed.branchId, 7, lastYear);

    await seedOtherOrg();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('happy path', () => {
    it('aggregates quantity across locations within the same storage', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ search: 'NIKE' })
        .expect(200);

      const nikeKhoA = res.body.data.find(
        (r: { storageId: string }) => r.storageId === storageAId,
      );
      const nikeKhoB = res.body.data.find(
        (r: { storageId: string }) => r.storageId === storageBId,
      );

      expect(nikeKhoA).toBeDefined();
      expect(nikeKhoA.quantity).toBe(8); // 5 + 3
      expect(nikeKhoA.item.code).toBe('NIKE-001');
      expect(nikeKhoA.item.brand).toBe('Nike');
      expect(nikeKhoA.item.categoryName).toBe('Giày nam');
      expect(nikeKhoA.storage.name).toBe('Kho A');

      expect(nikeKhoB).toBeDefined();
      expect(nikeKhoB.quantity).toBe(12);
    });

    it('returns separate rows for the same item across different storages', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ search: 'NIKE' })
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.total).toBe(2);
    });

    it('returns totalQuantity across the entire query (not just page)', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ pageSize: 1 })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      // 8 (Nike Kho A) + 12 (Nike Kho B) + 20 (Adidas Kho A) + 7 (Puma Kho B) = 47
      expect(res.body.totalQuantity).toBe(47);
      expect(res.body.total).toBe(4); // 4 distinct (item, storage)
    });

    it('paginates correctly', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ page: 1, pageSize: 2 })
        .expect(200);
      const page2 = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ page: 2, pageSize: 2 })
        .expect(200);

      expect(page1.body.data).toHaveLength(2);
      expect(page2.body.data).toHaveLength(2);
      expect(page1.body.total).toBe(4);
      expect(page2.body.total).toBe(4);
      const allKeys = new Set(
        [...page1.body.data, ...page2.body.data].map(
          (r: { itemId: string; storageId: string }) =>
            `${r.itemId}:${r.storageId}`,
        ),
      );
      expect(allKeys.size).toBe(4);
    });
  });

  describe('filters', () => {
    it('storageId filter narrows to one storage', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ storageId: storageAId })
        .expect(200);

      expect(res.body.data.every((r: { storageId: string }) => r.storageId === storageAId)).toBe(true);
      expect(res.body.total).toBe(2); // Nike + Adidas in Kho A
    });

    it('brand filter narrows results', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ brand: 'Adidas' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].item.brand).toBe('Adidas');
    });

    it('search matches code OR name (ILIKE)', async () => {
      const byCode = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ search: 'PUMA' })
        .expect(200);
      expect(byCode.body.data).toHaveLength(1);

      const byName = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ search: 'boost' })
        .expect(200);
      expect(byName.body.data).toHaveLength(1);
      expect(byName.body.data[0].item.code).toBe('ADIDAS-001');
    });

    it('movementFrom excludes rows with last_movement_at older than the boundary', async () => {
      const today = new Date();
      const isoToday = today.toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ movementFrom: isoToday })
        .expect(200);

      // Puma's last_movement_at is 1 year ago → excluded
      expect(res.body.data.every((r: { item: { code: string } }) => r.item.code !== 'PUMA-001')).toBe(true);
      expect(res.body.total).toBe(3); // Nike-A, Nike-B, Adidas-A
    });

    it('movementTo end-of-day is inclusive', async () => {
      const today = new Date();
      const isoToday = today.toISOString().slice(0, 10);
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ movementFrom: isoToday, movementTo: isoToday })
        .expect(200);

      // Movements set with `new Date()` (now) should fall within today
      expect(res.body.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.every((r: { item: { code: string } }) => r.item.code !== 'PUMA-001')).toBe(true);
    });
  });

  describe('cross-org isolation', () => {
    it('does not return rows from another organization', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/summary')
        .set(headers())
        .query({ pageSize: 200 })
        .expect(200);

      expect(
        res.body.data.every((r: { item: { code: string } }) => r.item.code !== 'OTHER-SKU'),
      ).toBe(true);
      expect(res.body.total).toBe(4); // only the main org's rows
    });
  });
});
