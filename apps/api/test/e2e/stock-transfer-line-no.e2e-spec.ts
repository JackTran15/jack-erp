import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * T-04-01 (AC-12): every `stock_transfer_lines` insert stamps a 1-based
 * `line_no` by array index, both for the branch-scoped "Chuyển kho" create
 * path and for edits (which delete + re-insert the whole line set).
 */
describe('Stock transfer line_no (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemAId: string;
  let itemBId: string;
  let itemCId: string;
  let srcStorageId: string;
  let dstStorageId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const headers = () => ({
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    });

    const item = (code: string) =>
      request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({ code, name: code, unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
        .expect(201);

    itemAId = (await item('LN-ITEM-A')).body.id;
    itemBId = (await item('LN-ITEM-B')).body.id;
    itemCId = (await item('LN-ITEM-C')).body.id;

    const src = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'LN Source WH', branchId: seed.branchId })
      .expect(201);
    srcStorageId = src.body.id;

    const dst = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'LN Dest WH', branchId: seed.branchId })
      .expect(201);
    dstStorageId = dst.body.id;

    // Each storage needs at least one concrete (non "Chưa xếp") shelf, or
    // resolveStorageTransferLocation rejects the transfer.
    await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'LN-SRC-LOC', type: 'SHELF', name: 'LN Src Shelf', storageId: srcStorageId, branchId: seed.branchId })
      .expect(201);
    await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'LN-DST-LOC', type: 'SHELF', name: 'LN Dst Shelf', storageId: dstStorageId, branchId: seed.branchId })
      .expect(201);
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

  function line(itemId: string, quantity: number) {
    return {
      itemId,
      quantity,
      sourceStorageId: srcStorageId,
      destinationStorageId: dstStorageId,
    };
  }

  it('stamps line_no = 1,2,3 on a freshly created 3-line transfer', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/stock/transfers')
      .set(headers())
      .send({
        allowNegative: true,
        lines: [line(itemAId, 1), line(itemBId, 2), line(itemCId, 3)],
      })
      .expect(201);

    const transferId = res.body.id;
    const lineNos = (res.body.lines as { itemId: string; lineNo: number }[])
      .slice()
      .sort((a, b) => a.lineNo - b.lineNo)
      .map((l) => l.lineNo);
    expect(lineNos).toEqual([1, 2, 3]);

    const rows = await ds.query(
      `SELECT line_no FROM stock_transfer_lines WHERE transfer_id = $1 ORDER BY line_no`,
      [transferId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2, 3]);
  });

  it('re-stamps line_no from 1 on edit, even when the line count/order changes', async () => {
    const created = await request(app.getHttpServer())
      .post('/inventory/stock/transfers')
      .set(headers())
      .send({ allowNegative: true, lines: [line(itemAId, 1), line(itemBId, 2), line(itemCId, 3)] })
      .expect(201);
    const transferId = created.body.id;

    // Edit down to 2 lines, in reversed item order.
    await request(app.getHttpServer())
      .patch(`/inventory/stock/transfers/${transferId}`)
      .set(headers())
      .send({ allowNegative: true, lines: [line(itemCId, 1), line(itemAId, 1)] })
      .expect(200);

    const rows = await ds.query(
      `SELECT item_id, line_no FROM stock_transfer_lines WHERE transfer_id = $1 ORDER BY line_no`,
      [transferId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2]);
    expect(rows[0].item_id).toBe(itemCId);
    expect(rows[1].item_id).toBe(itemAId);
  });
});
