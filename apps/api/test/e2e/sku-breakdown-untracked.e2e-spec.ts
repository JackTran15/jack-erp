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
 * Feature 2026092101-untracked-location-summary-report, UOW-01.
 *
 * "Chi tiết hàng hóa" (POST /v2/inventory/stock/summary/sku-breakdown) builds
 * its row set from tracked stock_balances UNION every (item, location) pair
 * with ledger history. Stopping a pair with "Ngừng theo dõi" only flips
 * is_tracked and keeps the ledger rows, so the history arm used to put the
 * stopped pair straight back as a 0 / 0 row. The unit spec can only pin the
 * SQL text; whether the NOT EXISTS actually removes the row — in any period,
 * and only for an explicitly stopped pair — needs Postgres.
 */
describe('Stopped pairs disappear from "Chi tiết hàng hóa" (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let storageId: string;
  let locStopped: string; // E01.01 — X's pair here is stopped, with ledger history
  let locLive: string; // K09.01 — tracked, quantity 0

  let itemX: string; // AC-01 / AC-02 / AC-04
  let itemY: string; // AC-03
  let itemZ: string; // AC-05

  // The month that holds X's E01.01 movements. Net 0 (a stopped pair must sit
  // at quantity 0), but in/out are 1 each — so if the pair leaked into the
  // dialog it would be visible in the footer, not just as an extra row.
  const PERIOD = { startDate: '2026-03-01', endDate: '2026-03-31' };

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  async function createLocation(code: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code, type: 'SHELF', name, storageId, branchId: seed.branchId })
      .expect(201);
    return res.body.id;
  }

  async function createItem(code: string, name: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code,
        name,
        unit: 'PCS',
        purchasePrice: 50,
        sellingPrice: 100,
      })
      .expect(201);
    return res.body.id;
  }

  async function putBalance(
    itemId: string,
    locId: string,
    quantity: number,
  ): Promise<void> {
    await ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, item_id, location_id, quantity,
          last_movement_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5,
               NOW(), $6::uuid, NOW(), NOW())
       ON CONFLICT (organization_id, item_id, location_id)
       DO UPDATE SET quantity = EXCLUDED.quantity`,
      [seed.organizationId, seed.branchId, itemId, locId, quantity, seed.userId],
    );
  }

  /** reference_type E2E_TEST never matches EXCLUDE_VOIDED_DOCS_SQL. */
  async function insertLedgerEntry(params: {
    itemId: string;
    locationId: string;
    quantity: number;
    postedAt: string;
  }): Promise<void> {
    await ds.query(
      `INSERT INTO stock_ledger_entries
         (id, organization_id, branch_id, item_id, location_id, movement_type,
          quantity, reference_type, reference_id, unit_cost, line_value,
          posted_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, $5,
               $6, 'E2E_TEST', gen_random_uuid(), 50, $7,
               $8::timestamptz, $9::uuid, NOW(), NOW())`,
      [
        seed.organizationId,
        seed.branchId,
        params.itemId,
        params.locationId,
        params.quantity > 0 ? 'PURCHASE_RECEIPT' : 'SALE_ISSUE',
        params.quantity,
        params.quantity * 50,
        params.postedAt,
        seed.userId,
      ],
    );
  }

  /** Goes through the real "Ngừng theo dõi" endpoint, not a raw UPDATE. */
  async function setTracking(
    entries: Array<{ itemId: string; locationId: string }>,
    isTracked: boolean,
  ): Promise<void> {
    await request(app.getHttpServer())
      .patch('/inventory/stock/balances/tracking')
      .set(headers())
      .send({ entries, isTracked })
      .expect(200);
  }

  interface BreakdownRow {
    itemId: string;
    locationId: string;
    locationCode: string;
    quantity: number;
    openingQty: number;
    inQty: number;
    outQty: number;
  }

  interface BreakdownResponse {
    data: BreakdownRow[];
    total: number;
    itemCount: number;
    totals: { quantity: number; openingQty: number; inQty: number; outQty: number };
  }

  async function breakdown(
    groupKey: string,
    period?: { startDate: string; endDate: string },
  ): Promise<BreakdownResponse> {
    const res = await request(app.getHttpServer())
      .post('/v2/inventory/stock/summary/sku-breakdown')
      .set(headers())
      .send({ groupKey, storageId, page: 1, limit: 50, ...(period ?? {}) })
      .expect(200);
    return res.body;
  }

  const locationIdsOf = (res: BreakdownResponse) =>
    res.data.map((r) => r.locationId).sort();

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // A warehouse, not the showroom: setBalanceTracking refuses to stop a
    // pair that sits in an is_main_storage storage.
    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'WH sku-breakdown-untracked', branchId: seed.branchId })
      .expect(201);
    storageId = storageRes.body.id;

    locStopped = await createLocation('E01.01', 'Kệ E01.01');
    locLive = await createLocation('K09.01', 'Kệ K09.01');

    // Standalone items (no product_id) — groupKey is the item id itself.
    itemX = await createItem('SBU-X', 'Item X');
    itemY = await createItem('SBU-Y', 'Item Y');
    itemZ = await createItem('SBU-Z', 'Item Z');

    // X: stopped at E01.01 (with history), tracked at K09.01 (no history).
    await putBalance(itemX, locStopped, 0);
    await insertLedgerEntry({
      itemId: itemX,
      locationId: locStopped,
      quantity: 1,
      postedAt: '2026-03-05T03:00:00Z',
    });
    await insertLedgerEntry({
      itemId: itemX,
      locationId: locStopped,
      quantity: -1,
      postedAt: '2026-03-20T03:00:00Z',
    });
    await setTracking([{ itemId: itemX, locationId: locStopped }], false);
    await putBalance(itemX, locLive, 0);

    // Y: one tracked pair at quantity 0, nothing else.
    await putBalance(itemY, locLive, 0);

    // Z: ledger history at E01.01 and NO balance row at all.
    await insertLedgerEntry({
      itemId: itemZ,
      locationId: locStopped,
      quantity: 2,
      postedAt: '2026-03-08T03:00:00Z',
    });
    // createTestApp + resetDatabase + seedBaseData alone runs into the minutes
    // on a cold local stack; the suite's 30s default is nowhere near enough.
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('AC-01 — a stopped pair with ledger history is not a row', () => {
    it('lists only the tracked K09.01 pair for item X', async () => {
      const res = await breakdown(itemX);

      expect(locationIdsOf(res)).toEqual([locLive]);
      expect(res.total).toBe(1);
      expect(res.itemCount).toBe(1);
      expect(res.totals.quantity).toBe(0);
    });
  });

  describe('AC-02 — filtering by period does not bring the stopped pair back', () => {
    it('keeps E01.01 out even though its movements fall inside the period', async () => {
      const res = await breakdown(itemX, PERIOD);

      expect(locationIdsOf(res)).toEqual([locLive]);
      // The E01.01 movements (+1 / -1 in March) must not reach the footer.
      expect(res.totals).toMatchObject({ openingQty: 0, inQty: 0, outQty: 0 });
    });
  });

  describe('AC-03 — a tracked pair at quantity 0 stays a row', () => {
    it('lists K09.01 for item Y with quantity 0', async () => {
      const res = await breakdown(itemY);

      expect(res.data).toHaveLength(1);
      expect(res.data[0]).toMatchObject({
        itemId: itemY,
        locationId: locLive,
        locationCode: 'K09.01',
        quantity: 0,
      });
    });
  });

  describe('AC-05 — a pair with history but no balance row is unchanged', () => {
    it('still lists E01.01 for item Z through the ledger arm', async () => {
      const res = await breakdown(itemZ, PERIOD);

      expect(locationIdsOf(res)).toEqual([locStopped]);
      expect(res.data[0]).toMatchObject({ locationCode: 'E01.01', inQty: 2 });
    });
  });

  describe('AC-04 — re-tracking restores the row', () => {
    it('brings E01.01 back for item X, with its period figures', async () => {
      await setTracking([{ itemId: itemX, locationId: locStopped }], true);

      const res = await breakdown(itemX, PERIOD);

      expect(locationIdsOf(res)).toEqual([locStopped, locLive].sort());
      const restored = res.data.find((r) => r.locationId === locStopped);
      expect(restored).toMatchObject({
        locationCode: 'E01.01',
        openingQty: 0,
        inQty: 1,
        outQty: 1,
        quantity: 0,
      });
      expect(res.totals).toMatchObject({ inQty: 1, outQty: 1 });
    });
  });
});
