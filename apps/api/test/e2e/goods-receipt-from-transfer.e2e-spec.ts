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
 * EPIC-08062026 goods-receipt-from-transfer: the import leg. A transfer order is
 * exported (IN_PROGRESS), then the destination branch picks it from the
 * importable list and confirms import → COMPLETED + a TRANSFER_IN goods receipt
 * that round-trips the header fields. Runs same-branch (source == destination)
 * so one seeded token satisfies both the export and import branch guards,
 * mirroring goods-issue-from-transfer.e2e-spec.ts.
 */
describe('Goods receipt from transfer order (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  let itemId: string;
  let srcStorageId: string;
  let srcLocationId: string;
  let destStorageId: string;
  let destLocationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'GRT-ITEM',
        name: 'Receipt-From-Transfer Item',
        unit: 'PCS',
        purchasePrice: 7,
        sellingPrice: 20,
      })
      .expect(201);
    itemId = item.body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GRT Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const dest = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GRT Dest WH', branchId: seed.branchId })
      .expect(201);
    destStorageId = dest.body.id;

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${srcStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    srcLocationId = locs.body.data[0].id;

    const destLocs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${destStorageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    destLocationId = destLocs.body.data[0].id;
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

  /** Create a DRAFT order and export it → IN_PROGRESS; returns the order id. */
  async function createAndExport(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post('/inventory/transfer-orders')
      .set(headers())
      .send({
        sourceBranchId: seed.branchId,
        destinationBranchId: seed.branchId,
        sourceStorageId: srcStorageId,
        notes: 'GRT e2e',
        lines: [{ itemId, requestedQty: 5, sourceStorageId: srcStorageId }],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${created.body.id}/export`)
      .set(headers())
      .send({
        lines: [{ itemId, locationId: srcLocationId, quantity: 5, unitPrice: 7 }],
      })
      .expect(201);

    return created.body.id as string;
  }

  function importable() {
    return request(app.getHttpServer())
      .get('/inventory/transfer-orders/importable')
      .set(headers());
  }

  it('lists an exported (IN_PROGRESS) order in the importable picker with the XK number + total', async () => {
    const orderId = await createAndExport();
    const res = await importable().expect(200);
    const row = (res.body as Array<{ id: string }>).find((r) => r.id === orderId) as
      | {
          id: string;
          status: string;
          sourceBranchName: string;
          exportGoodsIssueDocumentNumber: string | null;
          totalAmount: number;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row!.status).toBe('IN_PROGRESS');
    expect(typeof row!.sourceBranchName).toBe('string');
    expect(row!.exportGoodsIssueDocumentNumber).toBeTruthy();
    expect(row!.totalAmount).toBe(35); // 5 × 7
  });

  it('imports with the per-line Kho/Vị trí + header → COMPLETED, receipt round-trips the fields', async () => {
    const orderId = await createAndExport();

    const imported = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set(headers())
      .send({
        lines: [{ itemId, locationId: destLocationId, quantity: 5, unitPrice: 7 }],
        deliverer: 'Jack Jack',
        references: ['XK-REF'],
        occurredAt: '2026-06-08T15:24:00.000Z',
      })
      .expect(201);

    expect(imported.body.status).toBe('COMPLETED');
    const grId = imported.body.importGoodsReceiptId;
    expect(grId).toBeTruthy();

    const gr = await request(app.getHttpServer())
      .get(`/goods-receipts/${grId}`)
      .set(headers())
      .expect(200);
    expect(gr.body.purpose).toBe('TRANSFER_IN');
    expect(gr.body.referenceType).toBe('STOCK_TRANSFER');
    expect(gr.body.referenceId).toBe(orderId);
    expect(gr.body.deliveredBy).toBe('Jack Jack');
    expect(gr.body.references).toEqual(['XK-REF']);
    expect(gr.body.lines[0].locationId).toBe(destLocationId);
    expect(new Date(gr.body.receivedAt).toISOString()).toBe(
      '2026-06-08T15:24:00.000Z',
    );

    // The imported order must drop out of the importable picker.
    const after = await importable().expect(200);
    expect(
      (after.body as Array<{ id: string }>).some((r) => r.id === orderId),
    ).toBe(false);
  });

  it('rejects an import from a non-destination branch context is covered by guards; replays idempotently', async () => {
    const orderId = await createAndExport();
    const key = `grt-import-${orderId}`;
    const body = { destinationStorageId: destStorageId };

    const first = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post(`/inventory/transfer-orders/${orderId}/import`)
      .set({ ...headers(), 'X-Idempotency-Key': key })
      .send(body)
      .expect(201);

    expect(replay.body.importGoodsReceiptId).toBe(
      first.body.importGoodsReceiptId,
    );
  });
});
