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
 * T-05-01 (AC-18): every `stock_take_lines` insert stamps a 1-based `line_no`
 * — by array index on `create()` (batched lines) and by current-max + 1 on
 * `addLine()` (incremental).
 */
describe('Stock take line_no (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let itemAId: string;
  let itemBId: string;
  let itemCId: string;
  let itemDId: string;
  let storageId: string;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const item = (code: string) =>
      request(app.getHttpServer())
        .post('/inventory/items')
        .set(headers())
        .send({ code, name: code, unit: 'PCS', purchasePrice: 5, sellingPrice: 15 })
        .expect(201);

    itemAId = (await item('KKLN-ITEM-A')).body.id;
    itemBId = (await item('KKLN-ITEM-B')).body.id;
    itemCId = (await item('KKLN-ITEM-C')).body.id;
    itemDId = (await item('KKLN-ITEM-D')).body.id;

    const storage = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'KKLN Storage', branchId: seed.branchId })
      .expect(201);
    storageId = storage.body.id;

    await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'KKLN-LOC', type: 'SHELF', name: 'KKLN Shelf', storageId, branchId: seed.branchId })
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

  it('stamps line_no = 1,2,3 on a freshly created 3-line stock take', async () => {
    const res = await request(app.getHttpServer())
      .post('/inventory/stock-takes')
      .set(headers())
      .send({
        storageId,
        lines: [{ itemId: itemAId }, { itemId: itemBId }, { itemId: itemCId }],
      })
      .expect(201);

    const stockTakeId = res.body.id;

    const rows = await ds.query(
      `SELECT item_id, line_no FROM stock_take_lines WHERE stock_take_id = $1 ORDER BY line_no`,
      [stockTakeId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2, 3]);
    expect(rows.map((r: { item_id: string }) => r.item_id)).toEqual([
      itemAId,
      itemBId,
      itemCId,
    ]);
  });

  it('stamps the next line_no (current max + 1) when a line is added incrementally', async () => {
    const created = await request(app.getHttpServer())
      .post('/inventory/stock-takes')
      .set(headers())
      .send({
        storageId,
        lines: [{ itemId: itemAId }, { itemId: itemBId }],
      })
      .expect(201);
    const stockTakeId = created.body.id;

    const added = await request(app.getHttpServer())
      .post(`/inventory/stock-takes/${stockTakeId}/lines`)
      .set(headers())
      .send({ itemId: itemDId })
      .expect(201);

    expect(added.body.lineNo).toBe(3);

    const rows = await ds.query(
      `SELECT item_id, line_no FROM stock_take_lines WHERE stock_take_id = $1 ORDER BY line_no`,
      [stockTakeId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 2, 3]);
    expect(rows[2].item_id).toBe(itemDId);
  });

  it('renumbers from the current max after a middle line is removed, without colliding with the unique index', async () => {
    const created = await request(app.getHttpServer())
      .post('/inventory/stock-takes')
      .set(headers())
      .send({ storageId, lines: [{ itemId: itemAId }] })
      .expect(201);
    const stockTakeId = created.body.id;

    const line2 = await request(app.getHttpServer())
      .post(`/inventory/stock-takes/${stockTakeId}/lines`)
      .set(headers())
      .send({ itemId: itemBId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/inventory/stock-takes/${stockTakeId}/lines`)
      .set(headers())
      .send({ itemId: itemCId })
      .expect(201);

    // Remove the middle line (line_no = 2). If line_no were derived from
    // `st.lines.length` this would make the next add collide with the
    // remaining line_no = 3 and violate uq_stock_take_lines_doc_line_no.
    await request(app.getHttpServer())
      .delete(`/inventory/stock-takes/${stockTakeId}/lines/${line2.body.id}`)
      .set(headers())
      .expect(204);

    const readded = await request(app.getHttpServer())
      .post(`/inventory/stock-takes/${stockTakeId}/lines`)
      .set(headers())
      .send({ itemId: itemDId })
      .expect(201);

    expect(readded.body.lineNo).toBe(4);

    const rows = await ds.query(
      `SELECT item_id, line_no FROM stock_take_lines WHERE stock_take_id = $1 ORDER BY line_no`,
      [stockTakeId],
    );
    expect(rows.map((r: { line_no: number }) => r.line_no)).toEqual([1, 3, 4]);
    expect(rows.map((r: { item_id: string }) => r.item_id)).toEqual([
      itemAId,
      itemCId,
      itemDId,
    ]);
  });
});
