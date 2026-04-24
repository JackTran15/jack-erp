import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

describe('Inventory (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  // ─── Items, Storages, Locations ───────────────────────────────────

  describe('Items, Storages, Locations setup', () => {
    let itemId: string;
    let storageId: string;
    let locationId: string;

    it('should create an item', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({
          sku: 'ITEM-001',
          name: 'Widget A',
          unit: 'PCS',
          costPrice: 10.0,
          sellingPrice: 25.0,
        })
        .expect(201);

      itemId = res.body.id;
      expect(res.body.sku).toBe('ITEM-001');
    });

    it('should create a storage', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({
          name: 'Main Warehouse',
          branchId: seed.branchId,
        })
        .expect(201);

      storageId = res.body.id;
      expect(res.body.name).toBe('Main Warehouse');
    });

    it('should create a location within storage', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({
          name: 'Aisle A',
          storageId,
          branchId: seed.branchId,
        })
        .expect(201);

      locationId = res.body.id;
      expect(res.body.name).toBe('Aisle A');
    });

    it('should list items', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/items')
        .set(headers())
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Stock Transfer: draft → approve → post ──────────────────────

  describe('Stock Transfer lifecycle', () => {
    let itemId: string;
    let srcLocationId: string;
    let dstLocationId: string;
    let transferId: string;

    beforeAll(async () => {
      const itemRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({ sku: 'XFER-ITEM', name: 'Transfer Widget', unit: 'PCS', costPrice: 5, sellingPrice: 15 })
        .expect(201);
      itemId = itemRes.body.id;

      const srcStorageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'Source WH', branchId: seed.branchId })
        .expect(201);

      const srcLocRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({ name: 'Src Loc', storageId: srcStorageRes.body.id, branchId: seed.branchId })
        .expect(201);
      srcLocationId = srcLocRes.body.id;

      const dstStorageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'Dest WH', branchId: seed.branchId })
        .expect(201);

      const dstLocRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({ name: 'Dst Loc', storageId: dstStorageRes.body.id, branchId: seed.branchId })
        .expect(201);
      dstLocationId = dstLocRes.body.id;
    });

    it('should create a stock transfer (draft)', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/stock/transfers')
        .set(headers())
        .send({
          sourceLocationId: srcLocationId,
          destinationLocationId: dstLocationId,
          sourceBranchId: seed.branchId,
          destinationBranchId: seed.branchId,
          lines: [{ itemId, quantity: 10 }],
        })
        .expect(201);

      transferId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('should approve the transfer', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/stock/transfers/${transferId}/approve`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('APPROVED');
    });

    it('should post the transfer and create ledger entries', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/stock/transfers/${transferId}/post`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('POSTED');
    });

    it('should have created ledger entries for the transfer', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/stock/ledger')
        .set(headers())
        .query({ referenceId: transferId })
        .expect(200);

      expect(res.body.data?.length ?? res.body.length ?? 0).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── Stock Adjustment with threshold approval ────────────────────

  describe('Stock Adjustment lifecycle', () => {
    let itemId: string;
    let locationId: string;
    let adjustmentId: string;

    beforeAll(async () => {
      const itemRes = await request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({ sku: 'ADJ-ITEM', name: 'Adj Widget', unit: 'PCS', costPrice: 8, sellingPrice: 20 })
        .expect(201);
      itemId = itemRes.body.id;

      const storageRes = await request(app.getHttpServer())
        .post('/inventory/storages')
        .set(headers())
        .send({ name: 'Adj WH', branchId: seed.branchId })
        .expect(201);

      const locRes = await request(app.getHttpServer())
        .post('/inventory/locations')
        .set(headers())
        .send({ name: 'Adj Loc', storageId: storageRes.body.id, branchId: seed.branchId })
        .expect(201);
      locationId = locRes.body.id;
    });

    it('should create adjustment (draft)', async () => {
      const res = await request(app.getHttpServer())
        .post('/inventory/stock/adjustments')
        .set(headers())
        .send({
          locationId,
          branchId: seed.branchId,
          reasonCode: 'DAMAGE',
          lines: [{ itemId, quantity: -3, notes: 'Damaged goods' }],
        })
        .expect(201);

      adjustmentId = res.body.id;
      expect(res.body.status).toBe('DRAFT');
    });

    it('should submit for approval', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjustmentId}/submit`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('PENDING_APPROVAL');
    });

    it('should approve the adjustment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjustmentId}/approve`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('APPROVED');
    });

    it('should post the adjustment', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/stock/adjustments/${adjustmentId}/post`)
        .set(headers())
        .expect(201);

      expect(res.body.status).toBe('POSTED');
    });
  });

  // ─── CSV Import: validate + commit ────────────────────────────────

  describe('CSV Import pipeline', () => {
    it('should validate a CSV upload and return a job', async () => {
      const csvContent = 'sku,name,unit,costPrice,sellingPrice\nCSV-001,CSV Item,PCS,10,25';

      const res = await request(app.getHttpServer())
        .post('/inventory/imports/items/validate')
        .set(headers())
        .attach('file', Buffer.from(csvContent), {
          filename: 'items.csv',
          contentType: 'text/csv',
        })
        .expect(201);

      expect(res.body).toHaveProperty('jobId');
      expect(res.body).toHaveProperty('status');

      if (res.body.status === 'VALIDATED') {
        const commitRes = await request(app.getHttpServer())
          .post('/inventory/imports/items/commit')
          .set(headers())
          .query({ jobId: res.body.jobId })
          .expect(201);

        expect(commitRes.body).toHaveProperty('status');
      }
    });
  });
});
