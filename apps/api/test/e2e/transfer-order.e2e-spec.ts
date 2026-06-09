import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * Two-phase transfer voucher: DRAFT → IN_PROGRESS (export) → COMPLETED (import).
 * Runs same-branch (source branch == destination branch) so a single seeded
 * token satisfies both the source-branch export guard and the destination-branch
 * import guard, while still exercising per-line source/destination warehouses.
 */
describe('Transfer Order two-phase (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  let itemId: string;
  let srcStorageId: string;
  let dstStorageId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({ code: 'TO-ITEM', name: 'Transfer Item', unit: 'PCS', purchasePrice: 7, sellingPrice: 20 })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'TO Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const dst = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'TO Dest WH', branchId: seed.branchId })
      .expect(201);
    dstStorageId = dst.body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  function createVoucher() {
    return request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: seed.branchId,
        sourceStorageId: srcStorageId,
        notes: 'E2E transfer',
        // Lines carry only the source warehouse; destination is chosen at import.
        lines: [{ itemId, requestedQty: 5, sourceStorageId: srcStorageId }],
      });
  }

  describe('happy-path round-trip', () => {
    let voucherId: string;
    let code: string;

    it('creates a DRAFT voucher with an LDC number', async () => {
      const res = await createVoucher().expect(201);
      voucherId = res.body.id;
      code = res.body.documentNumber;
      expect(res.body.status).toBe('DRAFT');
      expect(code).toMatch(/^LDC/);
    });

    it('loads the voucher by code (org-scoped)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/inventory/transfer-orders/by-code/${code}`)
        .set(headers())
        .expect(200);
      expect(res.body.id).toBe(voucherId);
    });

    it('exports from the source branch → IN_PROGRESS, spawns a goods issue (negative stock allowed)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${voucherId}/export`)
        .set(headers())
        .expect(201);
      expect(res.body.status).toBe('IN_PROGRESS');
      expect(res.body.exportGoodsIssueId).toBeTruthy();
    });

    it('rejects a second export (not DRAFT)', async () => {
      await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${voucherId}/export`)
        .set(headers())
        .expect(409);
    });

    it('imports from the destination branch → COMPLETED, stores import_reference', async () => {
      const res = await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${voucherId}/import`)
        .set(headers())
        .send({ destinationStorageId: dstStorageId })
        .expect(201);
      expect(res.body.status).toBe('COMPLETED');
      expect(res.body.importGoodsReceiptId).toBeTruthy();
      expect(res.body.destinationStorageId).toBe(dstStorageId);
    });

    it('rejects a second import (not IN_PROGRESS)', async () => {
      await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${voucherId}/import`)
        .set(headers())
        .expect(409);
    });
  });

  describe('guards + cancel', () => {
    it('rejects import on a DRAFT voucher (must export first)', async () => {
      const res = await createVoucher().expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${res.body.id}/import`)
        .set(headers())
        .expect(409);
    });

    it('cancels a DRAFT voucher (no ledger impact)', async () => {
      const res = await createVoucher().expect(201);
      await request(app.getHttpServer())
        .delete(`/inventory/transfer-orders/${res.body.id}`)
        .set(headers())
        .expect(204);
      await request(app.getHttpServer())
        .get(`/inventory/transfer-orders/${res.body.id}`)
        .set(headers())
        .expect(404);
    });

    it('cancels an IN_PROGRESS voucher by reversing the export', async () => {
      const res = await createVoucher().expect(201);
      await request(app.getHttpServer())
        .post(`/inventory/transfer-orders/${res.body.id}/export`)
        .set(headers())
        .expect(201);
      await request(app.getHttpServer())
        .delete(`/inventory/transfer-orders/${res.body.id}`)
        .set(headers())
        .expect(204);
    });
  });
});
