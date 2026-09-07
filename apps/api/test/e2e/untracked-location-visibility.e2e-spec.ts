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
 * Feature 2026090401-untracked-location-hidden.
 *
 * "Ngừng theo dõi" flips stock_balances.is_tracked to false and deliberately
 * keeps the row (A-04), so tracking can be turned back on. Three read sites used
 * to ignore the flag: the "Xếp hàng hóa" column, its filter, and the item list
 * inside a location.
 *
 * These assertions need real Postgres. The unit specs alongside the services
 * mock the query builder, so they can only pin the SQL text — they cannot tell
 * NOT EXISTS(tracked) apart from EXISTS(untracked), which is the mistake this
 * feature is one keystroke away from.
 */
describe('Untracked locations disappear from "Vị trí hàng hóa" (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let storageId: string;
  let locEmptied: string; // every row untracked → "Chưa xếp"
  let locMixed: string; // one tracked row at qty 0 + two untracked → "Đã xếp"
  let locBulk: string; // 60 tracked + 40 untracked → pagination

  let itemA: string;
  let itemB: string;
  let itemC: string;
  let itemBelowMin: string;

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

  async function searchLocations(
    body: Record<string, unknown>,
  ): Promise<{ data: Array<{ id: string; hasItems: boolean }>; total: number }> {
    const res = await request(app.getHttpServer())
      .post('/v2/inventory/locations/search')
      .set(headers())
      // LocationSearchV2Dto caps limit at 100.
      .send({ limit: 100, ...body })
      .expect(201);
    return res.body;
  }

  const hasItemsOf = (
    result: { data: Array<{ id: string; hasItems: boolean }> },
    id: string,
  ) => result.data.find((l) => l.id === id)?.hasItems;

  async function stockItems(
    locId: string,
    query: Record<string, string | number> = {},
  ): Promise<{
    data: Array<{
      itemId: string;
      isTracked: boolean;
      quantity: number;
      minQty: number | null;
      maxQty: number | null;
    }>;
    meta: { total: number };
  }> {
    const res = await request(app.getHttpServer())
      .get(`/inventory/locations/${locId}/stock-items`)
      .query(query)
      .set(headers())
      .expect(200);
    return res.body;
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'WH untracked-visibility', branchId: seed.branchId })
      .expect(201);
    storageId = storageRes.body.id;

    locEmptied = await createLocation('UV-EMPTIED', 'Kệ đã dọn');
    locMixed = await createLocation('UV-MIXED', 'Kệ còn theo dõi');
    locBulk = await createLocation('UV-BULK', 'Kệ nhiều dòng');

    itemA = await createItem('UV-A', 'Item A');
    itemB = await createItem('UV-B', 'Item B');
    itemC = await createItem('UV-C', 'Item C');
    itemBelowMin = await createItem('UV-MIN', 'Item below min');

    // Every quantity here is 0, and that is the point. setBalanceTracking
    // refuses to stop tracking while stock remains ("Chỉ được ngừng theo dõi khi
    // tồn = 0"), so a stopped row is always an empty one. Holding quantity fixed
    // across both shelves leaves is_tracked as the only difference between them,
    // which is exactly the distinction the column has to make.
    await putBalance(itemA, locEmptied, 0);
    await putBalance(itemB, locEmptied, 0);
    // A threshold on a row that is about to be stopped — it must survive, since
    // the feature hides these rows without deleting anything (A-04).
    await setThreshold(itemA, locEmptied, 4, 40);
    await setTracking(
      [
        { itemId: itemA, locationId: locEmptied },
        { itemId: itemB, locationId: locEmptied },
      ],
      false,
    );

    // locMixed: one tracked row plus two stopped ones, all at quantity 0. The
    // tracked-but-empty row is what a quantity-based rule would wrongly hide.
    await putBalance(itemA, locMixed, 0);
    await putBalance(itemB, locMixed, 0);
    await putBalance(itemBelowMin, locMixed, 0);
    await setThreshold(itemBelowMin, locMixed, 10, null);
    await setTracking(
      [
        { itemId: itemB, locationId: locMixed },
        { itemId: itemBelowMin, locationId: locMixed },
      ],
      false,
    );

    // locBulk: 60 tracked + 40 untracked, inserted directly so the suite stays fast.
    // organization_id / branch_id / created_by are `character varying` on both
    // tables (BaseEntity leaves them untyped); only item_id / location_id are
    // real uuid columns. The ::text casts are load-bearing, not decoration:
    // without them Postgres deduces `character varying` for $1 from the INSERT
    // target and `text` from the WHERE comparison, and refuses the statement
    // with "inconsistent types deduced for parameter $1".
    await ds.query(
      `INSERT INTO items (id, organization_id, branch_id, created_by, code, name, unit,
                          purchase_price, selling_price)
       SELECT gen_random_uuid(), $1::text, $2::text, $3::text,
              'UV-BULK-' || g, 'Bulk ' || g, 'PCS', 10, 20
         FROM generate_series(1, 100) AS g`,
      [seed.organizationId, seed.branchId, seed.userId],
    );
    await ds.query(
      `INSERT INTO stock_balances
         (id, organization_id, branch_id, item_id, location_id, quantity,
          last_movement_at, created_by, created_at, updated_at, is_tracked)
       SELECT gen_random_uuid(), $1::text, $2::text, i.id, $4::uuid,
              CASE WHEN split_part(i.code, '-', 3)::int <= 60 THEN 1 ELSE 0 END,
              NOW(), $3::text, NOW(), NOW(),
              -- codes 1..60 stay tracked, 61..100 are stopped
              (split_part(i.code, '-', 3)::int <= 60)
         FROM items i
        WHERE i.organization_id = $1::text AND i.code LIKE 'UV-BULK-%'`,
      [seed.organizationId, seed.branchId, seed.userId, locBulk],
    );
    // createTestApp + resetDatabase + seedBaseData alone runs into the minutes on
    // a cold local stack; the suite's 30s default is nowhere near enough.
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('AC-01/AC-02 — the "Xếp hàng hóa" column', () => {
    it('reads "Chưa xếp" once every row at the location is stopped', async () => {
      const result = await searchLocations({});
      expect(hasItemsOf(result, locEmptied)).toBe(false);
    });

    it('stays "Đã xếp" for a tracked row sitting at quantity 0', async () => {
      const result = await searchLocations({});
      // A shelf that is temporarily out of stock is still arranged (A-03).
      expect(hasItemsOf(result, locMixed)).toBe(true);
    });
  });

  describe('AC-03 — the column filter agrees with the column', () => {
    it('"Chưa xếp" returns the emptied shelf and not the mixed one', async () => {
      const result = await searchLocations({ hasItems: false });
      const ids = result.data.map((l) => l.id);
      expect(ids).toContain(locEmptied);
      expect(ids).not.toContain(locMixed);
      expect(result.total).toBe(result.data.length);
    });

    it('"Đã xếp" returns the mixed shelf and not the emptied one', async () => {
      const result = await searchLocations({ hasItems: true });
      const ids = result.data.map((l) => l.id);
      expect(ids).toContain(locMixed);
      expect(ids).not.toContain(locEmptied);
      expect(result.total).toBe(result.data.length);
    });

    it('splits every location into exactly one of the two buckets', async () => {
      const [all, placed, empty] = await Promise.all([
        searchLocations({}),
        searchLocations({ hasItems: true }),
        searchLocations({ hasItems: false }),
      ]);
      expect(placed.total + empty.total).toBe(all.total);
    });
  });

  describe('AC-04 — turning tracking back on', () => {
    it('restores "Đã xếp", the row, and its thresholds', async () => {
      await setTracking([{ itemId: itemA, locationId: locEmptied }], true);
      try {
        const result = await searchLocations({});
        expect(hasItemsOf(result, locEmptied)).toBe(true);

        const items = await stockItems(locEmptied, { isTracked: 'true' });
        expect(items.data).toHaveLength(1);
        expect(items.data[0].itemId).toBe(itemA);
        // Hidden, never deleted (A-04) — the min/max set before stopping is
        // still on the row that came back.
        expect(Number(items.data[0].minQty)).toBe(4);
        expect(Number(items.data[0].maxQty)).toBe(40);
      } finally {
        // Restore even on failure: the later cases read this same shelf, and a
        // half-finished round trip here would fail them for the wrong reason.
        await setTracking([{ itemId: itemA, locationId: locEmptied }], false);
      }

      const after = await searchLocations({});
      expect(hasItemsOf(after, locEmptied)).toBe(false);
    });
  });

  describe('AC-05 — the v1 location list uses the same definition', () => {
    it('reports hasItems=false for a shelf whose rows are all stopped', async () => {
      const res = await request(app.getHttpServer())
        .get('/inventory/locations')
        .query({ page: 1, pageSize: 200, storageId })
        .set(headers())
        .expect(200);
      const row = res.body.data.find(
        (l: { id: string }) => l.id === locEmptied,
      );
      expect(row.hasItems).toBe(false);
      const mixed = res.body.data.find((l: { id: string }) => l.id === locMixed);
      expect(mixed.hasItems).toBe(true);
    });
  });

  describe('AC-06/AC-14 — the item list inside a location', () => {
    it('isTracked=true returns only the tracked rows', async () => {
      const res = await stockItems(locMixed, { isTracked: 'true' });
      expect(res.meta.total).toBe(1);
      expect(res.data.map((r) => r.itemId)).toEqual([itemA]);
    });

    it('isTracked=false returns only the stopped rows', async () => {
      const res = await stockItems(locMixed, { isTracked: 'false' });
      expect(res.meta.total).toBe(2);
      expect(res.data.every((r) => r.isTracked === false)).toBe(true);
    });

    it('omitting the parameter keeps the old behaviour — everything', async () => {
      const res = await stockItems(locMixed);
      expect(res.meta.total).toBe(3);
    });

    it('an unparseable value falls back to "all" rather than 400', async () => {
      const res = await stockItems(locMixed, { isTracked: 'xyz' });
      expect(res.meta.total).toBe(3);
    });
  });

  describe('AC-09 — the filter runs in SQL, before pagination', () => {
    it('pages 60 tracked rows out of 100 without leaking short pages', async () => {
      const page1 = await stockItems(locBulk, {
        isTracked: 'true',
        page: 1,
        pageSize: 50,
      });
      expect(page1.meta.total).toBe(60);
      expect(page1.data).toHaveLength(50);

      const page2 = await stockItems(locBulk, {
        isTracked: 'true',
        page: 2,
        pageSize: 50,
      });
      expect(page2.data).toHaveLength(10);
      expect(page2.data.every((r) => r.isTracked)).toBe(true);
    });
  });

  describe('AC-10 — the below-minimum branch', () => {
    it('hides a stopped row that sits under its minimum', async () => {
      // itemBelowMin is at qty 1 with min 10, but tracking is off.
      const filtered = await stockItems(locMixed, {
        isTracked: 'true',
        stockState: 'below-min',
      });
      expect(filtered.data.map((r) => r.itemId)).not.toContain(itemBelowMin);

      const unfiltered = await stockItems(locMixed, {
        stockState: 'below-min',
      });
      expect(unfiltered.data.map((r) => r.itemId)).toContain(itemBelowMin);
    });
  });
});
