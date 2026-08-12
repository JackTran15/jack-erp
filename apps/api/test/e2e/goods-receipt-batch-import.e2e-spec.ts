import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  SeedResult,
} from './setup/test-app';

/**
 * batch-ledger-write (UOW-01, T-01-03): reproduces the shape of the real
 * production failure — NhapkhauHangHoaNhapKho SHOWROOM.xls, 1.686 lines, one
 * warehouse/location, 6 SKUs posted on two separate lines each (1.680 unique
 * items + 6 duplicates = 1.686). SKU codes here are synthetic; the line
 * count and duplicate pattern reproduce the real file exactly.
 *
 * Before this fix, StockLedgerService.recordBatchMovements processed a batch
 * this size with ~5-8 sequential DB round-trips per line — 111.349ms and
 * 139.188ms in production logs, both ending in the generic
 * "Không thể nhập kho. Vui lòng thử lại." error. See
 * .ai/features/batch-ledger-write/00-intent.md for the full trace.
 */
describe('Goods receipt — batch import posting (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let locationId: string;
  let itemIds: string[];

  const LINE_COUNT = 1686;
  const DUPLICATE_COUNT = 6; // items appearing on two lines at the same location
  const UNIQUE_ITEM_COUNT = LINE_COUNT - DUPLICATE_COUNT; // 1.680 — matches the real file

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await grantGoodsReceiptPermissions();

    const storage = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'Showroom BMT', branchId: seed.branchId })
      .expect(201);

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${storage.body.id}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    locationId = locs.body.data[0].id;

    itemIds = await seedItems();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  /** goods_receipt.* isn't in seedBaseData's default permission set — no
   *  existing E2E flow calls POST /goods-receipts directly today. */
  async function grantGoodsReceiptPermissions(): Promise<void> {
    const roleId = 'd0000000-0000-4000-8000-000000000001';
    for (const perm of ['goods_receipt.read', 'goods_receipt.write', 'goods_receipt.post']) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'inventory')
         ON CONFLICT DO NOTHING`,
        [perm],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, perm],
      );
    }
  }

  /** 1.680 items, bulk-inserted directly — item creation isn't under test. */
  async function seedItems(): Promise<string[]> {
    const ids = Array.from({ length: UNIQUE_ITEM_COUNT }, () => randomUUID());
    const params: unknown[] = [];
    const values = ids.map((id, i) => {
      const base = params.length;
      params.push(id, seed.organizationId, seed.userId, `BLW-${i}`, `Batch item ${i}`, 'PCS');
      return (
        `($${base + 1}::uuid, $${base + 2}::uuid, $${base + 3}::uuid, ` +
        `$${base + 4}, $${base + 5}, $${base + 6}, NOW(), NOW())`
      );
    });
    await ds.query(
      `INSERT INTO items (id, organization_id, created_by, code, name, unit, created_at, updated_at)
       VALUES ${values.join(',\n')}`,
      params,
    );
    return ids;
  }

  function buildLines() {
    const lines = itemIds.map((itemId) => ({
      itemId,
      locationId,
      uomCode: 'PCS',
      quantity: 1,
      unitPrice: 10_000,
    }));
    // 6 duplicates: the first 6 items posted again at the same location,
    // exactly mirroring TX3150-D / TX3468-SN / TX3485-K / ... in the real file.
    for (let i = 0; i < DUPLICATE_COUNT; i++) {
      lines.push({
        itemId: itemIds[i],
        locationId,
        uomCode: 'PCS',
        quantity: 1,
        unitPrice: 10_000,
      });
    }
    return lines;
  }

  it(
    'posts a 1.686-line goods receipt (real-file shape) fast, with correct ledger + balances',
    async () => {
      const lines = buildLines();
      expect(lines).toHaveLength(LINE_COUNT);

      const startedAt = Date.now();
      const res = await request(app.getHttpServer())
        .post('/goods-receipts')
        .set(headers())
        .send({
          purpose: 'OTHER',
          receivedAt: '2026-08-12T00:00:00.000Z',
          locationId,
          lines,
        })
        .expect(201);
      const elapsedMs = Date.now() - startedAt;

      expect(res.body.status).toBe('POSTED');
      // Production logs show the old sequential code taking 111.349-139.188s
      // on this exact line count before failing. Assert an order of
      // magnitude under that, with margin for CI variance — the point is
      // "not 100+ seconds", not a tight perf budget.
      expect(elapsedMs).toBeLessThan(15_000);

      // stock_ledger_entries stays 1:1 with input lines — never aggregated.
      const ledgerCount = await ds.query(
        `SELECT COUNT(*)::int AS count FROM stock_ledger_entries WHERE reference_id = $1`,
        [res.body.id],
      );
      expect(Number(ledgerCount[0].count)).toBe(LINE_COUNT);

      // The 6 duplicated items aggregate into a single stock_balances row
      // each, with the summed quantity (+2) — not two rows of +1.
      for (let i = 0; i < DUPLICATE_COUNT; i++) {
        const balanceRows = await ds.query(
          `SELECT quantity FROM stock_balances WHERE item_id = $1 AND location_id = $2`,
          [itemIds[i], locationId],
        );
        expect(balanceRows).toHaveLength(1);
        expect(Number(balanceRows[0].quantity)).toBe(2);
      }

      // A non-duplicated item posts its ordinary quantity (+1).
      const singleBalance = await ds.query(
        `SELECT quantity FROM stock_balances WHERE item_id = $1 AND location_id = $2`,
        [itemIds[DUPLICATE_COUNT], locationId],
      );
      expect(Number(singleBalance[0].quantity)).toBe(1);
    },
    30_000,
  );
});
