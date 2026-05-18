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

describe('Stock-by-Location API — EPIC-013 (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let storageId: string;
  let locationId: string;
  let otherBranchLocationId: string;
  let categoryAId: string;
  let categoryBId: string;
  let providerXId: string;
  let providerYId: string;
  let itemNikeId: string;     // active, pos-visible, has barcode, in category A, provider X (primary), threshold min=10
  let itemAdidasId: string;   // active, pos-visible, in category B, provider Y, threshold min=5
  let itemHiddenId: string;   // not pos-visible
  let itemInactiveId: string; // not active
  let otherBranchId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

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

  async function createProvider(code: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/providers')
      .set(headers())
      .send({ code, name })
      .expect(201);
    return res.body.id;
  }

  async function createItem(payload: {
    code: string;
    name: string;
    isPosVisible?: boolean;
    isActive?: boolean;
    categoryId?: string;
  }): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: payload.code,
        name: payload.name,
        unit: 'PCS',
        purchasePrice: 50,
        sellingPrice: 100,
        isPosVisible: payload.isPosVisible ?? true,
        isActive: payload.isActive ?? true,
        categoryId: payload.categoryId,
      })
      .expect(201);
    return res.body.id;
  }

  async function linkProvider(
    itemId: string,
    providerId: string,
    isPrimary: boolean,
  ): Promise<void> {
    await request(app.getHttpServer())
      .post(`/inventory/items/${itemId}/providers`)
      .set(headers())
      .send({ providerId, isPrimary })
      .expect(201);
  }

  async function addBarcode(itemId: string, code: string): Promise<void> {
    await request(app.getHttpServer())
      .post(`/inventory/items/${itemId}/barcodes`)
      .set(headers())
      .send({ code })
      .expect(201);
  }

  async function setThreshold(
    itemId: string,
    locId: string,
    minQty: number | null,
    maxQty: number | null,
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch(`/inventory/items/${itemId}/thresholds/${locId}`)
      .set(headers())
      .send({ minQty, maxQty })
      .expect(200);
  }

  async function insertStockBalance(
    itemId: string,
    locId: string,
    branchId: string,
    quantity: number,
  ): Promise<void> {
    await ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, item_id, location_id, quantity, last_movement_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, NOW(), $6::uuid, NOW(), NOW())
       ON CONFLICT (organization_id, item_id, location_id)
       DO UPDATE SET quantity = EXCLUDED.quantity, last_movement_at = NOW()`,
      [seed.organizationId, branchId, itemId, locId, quantity, seed.userId],
    );
  }

  async function seedOtherBranch(): Promise<void> {
    otherBranchId = 'b0000000-0000-4000-8000-00000000BBBB';
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Other Branch', 'ACTIVE', false, $3::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [otherBranchId, seed.organizationId, seed.userId],
    );
    const otherStorageRows = await ds.query<Array<{ id: string }>>(
      `INSERT INTO storages
        (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'Other WH', false, $3::uuid, NOW(), NOW())
       RETURNING id`,
      [seed.organizationId, otherBranchId, seed.userId],
    );
    const otherStorageId = otherStorageRows[0].id;
    const otherLocRows = await ds.query<Array<{ id: string }>>(
      `INSERT INTO locations
        (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, 'OB-01', 'Other Loc', 'SHELF', true, $4::uuid, NOW(), NOW())
       RETURNING id`,
      [seed.organizationId, otherBranchId, otherStorageId, seed.userId],
    );
    otherBranchLocationId = otherLocRows[0].id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'Main WH (EPIC-013)', branchId: seed.branchId })
      .expect(201);
    storageId = storageRes.body.id;

    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({
        code: 'E13-LOC',
        type: 'SHELF',
        name: 'Aisle E13',
        storageId,
        branchId: seed.branchId,
      })
      .expect(201);
    locationId = locRes.body.id;

    categoryAId = await createCategory('Giày thể thao');
    categoryBId = await createCategory('Giày da');
    providerXId = await createProvider('NCC-X', 'NCC X');
    providerYId = await createProvider('NCC-Y', 'NCC Y');

    itemNikeId = await createItem({
      code: 'NIKE-001',
      name: 'Nike Air Max',
      categoryId: categoryAId,
    });
    itemAdidasId = await createItem({
      code: 'ADIDAS-001',
      name: 'Adidas Boost',
      categoryId: categoryBId,
    });
    itemHiddenId = await createItem({
      code: 'HIDDEN-001',
      name: 'Hidden Item',
      categoryId: categoryAId,
      isPosVisible: false,
    });
    itemInactiveId = await createItem({
      code: 'INACT-001',
      name: 'Inactive Item',
      categoryId: categoryAId,
      isActive: false,
    });

    await linkProvider(itemNikeId, providerXId, true);
    await linkProvider(itemAdidasId, providerYId, true);
    await addBarcode(itemNikeId, '8934567890123');
    await addBarcode(itemNikeId, '8934567890124');
    await addBarcode(itemAdidasId, '7000000000001');

    await setThreshold(itemNikeId, locationId, 10, 100);
    await setThreshold(itemAdidasId, locationId, 5, 50);

    // stock balances: Nike=5 (below min=10), Adidas=20 (healthy), Hidden=0, Inactive=-2 (negative)
    await insertStockBalance(itemNikeId, locationId, seed.branchId, 5);
    await insertStockBalance(itemAdidasId, locationId, seed.branchId, 20);
    await insertStockBalance(itemHiddenId, locationId, seed.branchId, 0);
    await insertStockBalance(itemInactiveId, locationId, seed.branchId, -2);

    await seedOtherBranch();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('happy path', () => {
    it('returns paginated items + location meta', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .expect(200);

      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('meta');
      expect(res.body.meta.location).toEqual(
        expect.objectContaining({
          id: locationId,
          code: 'E13-LOC',
          name: 'Aisle E13',
          type: 'SHELF',
          isActive: true,
          storage: expect.objectContaining({ id: storageId, name: 'Main WH (EPIC-013)' }),
          branch: expect.objectContaining({ id: seed.branchId, name: 'Main Branch' }),
        }),
      );
      expect(res.body.meta.total).toBe(4);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.pageSize).toBe(50);
      expect(res.body.data).toHaveLength(4);
    });

    it('includes barcodes, providers, thresholds, belowMin on Nike row', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ search: 'NIKE' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      const nike = res.body.data[0];
      expect(nike.code).toBe('NIKE-001');
      expect(nike.categoryName).toBe('Giày thể thao');
      expect(nike.barcodes).toEqual(
        expect.arrayContaining(['8934567890123', '8934567890124']),
      );
      expect(nike.providers).toEqual([
        expect.objectContaining({
          providerId: providerXId,
          providerName: 'NCC X',
          isPrimary: true,
        }),
      ]);
      expect(nike.quantity).toBe(5);
      expect(nike.minQty).toBe(10);
      expect(nike.maxQty).toBe(100);
      expect(nike.belowMin).toBe(true);
    });

    it('returns negative-stock rows by default (stockState=all)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .expect(200);

      const inactive = res.body.data.find(
        (r: { itemId: string }) => r.itemId === itemInactiveId,
      );
      expect(inactive).toBeDefined();
      expect(inactive.quantity).toBe(-2);
    });
  });

  describe('filters', () => {
    it('search → matches code & name partial', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ search: 'adidas' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].code).toBe('ADIDAS-001');
    });

    it('barcode → exact match', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ barcode: '8934567890124' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemNikeId);
    });

    it('categoryId → filters by category FK', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ categoryId: categoryBId })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemAdidasId);
    });

    it('providerId → filters via item_providers EXISTS', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ providerId: providerXId })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemNikeId);
    });

    it('isPosVisible=false → returns only hidden items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ isPosVisible: false })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemHiddenId);
    });

    it('isActive=false → returns only inactive items', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ isActive: false })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemInactiveId);
    });

    it('stockState=negative → only Inactive row', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ stockState: 'negative' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemInactiveId);
    });

    it('stockState=zero → only Hidden row', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ stockState: 'zero' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemHiddenId);
    });

    it('stockState=below-min → only Nike (qty=5 < min=10)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ stockState: 'below-min' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemNikeId);
      expect(res.body.data[0].belowMin).toBe(true);
    });

    it('combined: search=NIKE + isPosVisible=true + stockState=below-min', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ search: 'NIKE', isPosVisible: true, stockState: 'below-min' })
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].itemId).toBe(itemNikeId);
    });
  });

  describe('pagination', () => {
    it('pageSize=2 page=1 → first 2 sorted by name asc', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ pageSize: 2, page: 1, sortBy: 'name', sortOrder: 'asc' })
        .expect(200);

      expect(res.body.data).toHaveLength(2);
      expect(res.body.meta.total).toBe(4);
      expect(res.body.meta.page).toBe(1);
      expect(res.body.meta.pageSize).toBe(2);
    });

    it('pageSize=2 page=2 → remaining 2 rows', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ pageSize: 2, page: 2 })
        .expect(200);

      expect(res.body.data).toHaveLength(2);
    });
  });

  describe('error cases', () => {
    it('404 when locationId not found', async () => {
      await request(app.getHttpServer())
        .get('/inventory/locations/00000000-0000-4000-8000-000000000099/stock-items')
        .set(headers())
        .expect(404);
    });

    it('403 when location belongs to a different branch', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/locations/${otherBranchLocationId}/stock-items`)
        .set({
          Authorization: authHeader(seed.accessToken),
          'X-Branch-Id': seed.branchId,
        })
        .expect(403);
    });

    it('401 when missing Authorization header', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set({ 'X-Branch-Id': seed.branchId })
        .expect(401);
    });

    it('400 when stockState is invalid enum', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ stockState: 'foo' })
        .expect(400);
    });

    it('400 when pageSize exceeds max', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ pageSize: 99999 })
        .expect(400);
    });

    it('400 when sortBy is not whitelisted', async () => {
      await request(app.getHttpServer())
        .get(`/inventory/locations/${locationId}/stock-items`)
        .set(headers())
        .query({ sortBy: 'id; DROP TABLE items;--' })
        .expect(400);
    });
  });
});
