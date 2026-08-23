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
 * EPIC-08062026 round-trip: a goods issue must persist and return the fields the
 * form collects — deliverer (Người giao), references[] (Tham chiếu), occurredAt
 * (Ngày/Giờ xuất) — and each line must carry its own location (Kho/Vị trí) on
 * both the detail read (getById) and the v2 search list.
 */
describe('Goods issue field round-trip (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let itemId: string;
  let storageId: string;
  let locationId: string;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetDatabase(app);
    seed = await seedBaseData(app);

    const item = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'GIR-ITEM',
        name: 'Round-trip item',
        unit: 'PCS',
        purchasePrice: 10,
        sellingPrice: 20,
      })
      .expect(201);
    itemId = item.body.id;

    const st = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'GIR WH', branchId: seed.branchId })
      .expect(201);
    storageId = st.body.id;

    const locs = await request(app.getHttpServer())
      .get(
        `/inventory/locations?page=1&pageSize=1&storageId=${storageId}&includeUnassigned=true`,
      )
      .set(headers())
      .expect(200);
    locationId = locs.body.data[0].id;
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

  it('persists deliverer / references / occurredAt and returns them + per-line location', async () => {
    const occurredAt = '2026-06-08T14:41:00.000Z';

    const created = await request(app.getHttpServer())
      .post('/inventory/goods-issues')
      .set(headers())
      .send({
        locationId,
        purpose: 'OTHER',
        notes: 'round-trip',
        deliverer: 'Nguyễn Văn A',
        references: ['R-1', 'R-2'],
        occurredAt,
        lines: [{ itemId, locationId, quantity: 1, unitPrice: 350000 }],
      })
      .expect(201);
    const id = created.body.id as string;

    // Detail read (view dialog path).
    const gi = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${id}`)
      .set(headers())
      .expect(200);
    expect(gi.body.deliverer).toBe('Nguyễn Văn A');
    expect(gi.body.references).toEqual(['R-1', 'R-2']);
    expect(new Date(gi.body.occurredAt).toISOString()).toBe(occurredAt);
    expect(gi.body.lines[0].location.id).toBe(locationId);
    expect(gi.body.lines[0].location.storageId).toBe(storageId);

    // v2 search list path — the fix that makes Kho/Vị trí load in the list/view.
    const search = await request(app.getHttpServer())
      .post('/v2/inventory/goods-issues/search')
      .set(headers())
      .send({})
      .expect(201);
    const row = (search.body.data as Array<{ id: string }>).find(
      (r) => r.id === id,
    ) as { deliverer: string } | undefined;
    expect(row).toBeDefined();
    expect(row!.deliverer).toBe('Nguyễn Văn A');

    // The v2 search row deliberately carries no `lines` any more — line detail is
    // lazy, via GET /:id/lines (see search-goods-issues-v2.handler.ts). This
    // assertion used to read row.lines[0] and had gone stale unnoticed, because
    // the whole suite was failing earlier on a missing permission.
    const linesPage = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${id}/lines?page=1&pageSize=10`)
      .set(headers())
      .expect(200);
    expect(linesPage.body.items[0].location?.id).toBe(locationId);
  });

  /**
   * INV-2 on real rows: a voucher's ledger value must equal the voucher's own
   * value. Mocks cannot prove this — the assertion has to read stock_ledger_entries.
   */
  describe('per-line cost basis on the ledger (AC-02)', () => {
    /** Σ line_value and Σ quantity the ledger holds for one voucher. */
    async function ledgerTotals(referenceId: string) {
      const [row] = await ds.query(
        `SELECT COALESCE(SUM(line_value), 0)::float8 AS value,
                COALESCE(SUM(quantity), 0)::float8   AS quantity,
                COUNT(*)::int                        AS rows
           FROM stock_ledger_entries
          WHERE reference_type = 'GOODS_ISSUE' AND reference_id = $1`,
        [referenceId],
      );
      return row as { value: number; quantity: number; rows: number };
    }

    it('writes one row per line, each at its own price, and holds INV-2 (AC-02)', async () => {
      // The reported voucher, scaled to this fixture: the same item twice, two prices.
      const created = await request(app.getHttpServer())
        .post('/inventory/goods-issues')
        .set(headers())
        .send({
          locationId,
          purpose: 'SALE',
          lines: [
            { itemId, locationId, quantity: 30, unitPrice: 350000 },
            { itemId, locationId, quantity: 60, unitPrice: 340000 },
          ],
        })
        .expect(201);
      const id = created.body.id as string;

      // POST /inventory/goods-issues is createAndPost — the voucher is already
      // POSTED and on the ledger by the time the request returns.
      const gi = await request(app.getHttpServer())
        .get(`/inventory/goods-issues/${id}`)
        .set(headers())
        .expect(200);
      const prices = (gi.body.lines as Array<{ unitPrice: string }>)
        .map((l) => Number(l.unitPrice))
        .sort((a, b) => a - b);
      // Before this feature both rows came back as the item's branch average.
      expect(prices).toEqual([340000, 350000]);

      const totals = await ledgerTotals(id);
      expect(totals.rows).toBe(2);
      expect(totals.quantity).toBe(-90);
      // INV-2: −(30 × 350.000 + 60 × 340.000)
      expect(totals.value).toBe(-30_900_000);
    });

    it('fills a blank price from the moving average and posts at it (AC-03)', async () => {
      // GIR-ITEM has no ledger history of its own here, so the average falls back
      // to items.purchase_price = 10 — the point is that it is resolved, not left 0.
      const created = await request(app.getHttpServer())
        .post('/inventory/goods-issues')
        .set(headers())
        .send({
          locationId,
          purpose: 'SALE',
          lines: [{ itemId, locationId, quantity: 5 }],
        })
        .expect(201);
      const id = created.body.id as string;

      const gi = await request(app.getHttpServer())
        .get(`/inventory/goods-issues/${id}`)
        .set(headers())
        .expect(200);
      const unitPrice = Number(gi.body.lines[0].unitPrice);
      expect(unitPrice).toBeGreaterThan(0);

      const totals = await ledgerTotals(id);
      expect(totals.quantity).toBe(-5);
      expect(totals.value).toBe(-(5 * unitPrice));
    });

    it('holds INV-1 and INV-2 after an edit, appending rows and rewriting none (AC-06)', async () => {
      const created = await request(app.getHttpServer())
        .post('/inventory/goods-issues')
        .set(headers())
        .send({
          locationId,
          purpose: 'SALE',
          lines: [
            { itemId, locationId, quantity: 30, unitPrice: 350000 },
            { itemId, locationId, quantity: 60, unitPrice: 340000 },
          ],
        })
        .expect(201);
      const id = created.body.id as string;

      const before = await ds.query(
        `SELECT id, posted_at FROM stock_ledger_entries
          WHERE reference_type = 'GOODS_ISSUE' AND reference_id = $1
          ORDER BY id`,
        [id],
      );

      // Drop the 340.000 line from 60 to 50.
      await request(app.getHttpServer())
        .patch(`/inventory/goods-issues/${id}`)
        .set(headers())
        .send({
          lines: [
            { itemId, locationId, quantity: 30, unitPrice: 350000 },
            { itemId, locationId, quantity: 50, unitPrice: 340000 },
          ],
        })
        .expect(200);

      const gi = await request(app.getHttpServer())
        .get(`/inventory/goods-issues/${id}`)
        .set(headers())
        .expect(200);
      const lines = (gi.body.lines as Array<{ quantity: string; unitPrice: string }>)
        .map((l) => [Number(l.quantity), Number(l.unitPrice)])
        .sort((a, b) => a[0] - b[0]);
      // Two rows, still two prices — neither re-priced to match the other.
      expect(lines).toEqual([
        [30, 350000],
        [50, 340000],
      ]);

      const totals = await ledgerTotals(id);
      // INV-1 and INV-2 against the voucher as it now stands.
      expect(totals.quantity).toBe(-80);
      expect(totals.value).toBe(-27_500_000);

      // The books are append-only: existing rows must survive untouched.
      const after = await ds.query(
        `SELECT id, posted_at FROM stock_ledger_entries
          WHERE reference_type = 'GOODS_ISSUE' AND reference_id = $1
          ORDER BY id`,
        [id],
      );
      expect(after.length).toBeGreaterThan(before.length);
      const afterById = new Map(
        (after as Array<{ id: string; posted_at: Date }>).map((r) => [r.id, r]),
      );
      for (const row of before as Array<{ id: string; posted_at: Date }>) {
        expect(afterById.get(row.id)?.posted_at).toEqual(row.posted_at);
      }
    });

    it('rejects a negative unit price without touching the ledger (AC-04)', async () => {
      await request(app.getHttpServer())
        .post('/inventory/goods-issues')
        .set(headers())
        .send({
          locationId,
          purpose: 'SALE',
          lines: [{ itemId, locationId, quantity: 1, unitPrice: -1 }],
        })
        .expect(400);
    });
  });

  it('defaults references to [] and leaves deliverer/occurredAt null when omitted', async () => {
    const created = await request(app.getHttpServer())
      .post('/inventory/goods-issues')
      .set(headers())
      .send({
        locationId,
        purpose: 'OTHER',
        lines: [{ itemId, locationId, quantity: 1 }],
      })
      .expect(201);

    const gi = await request(app.getHttpServer())
      .get(`/inventory/goods-issues/${created.body.id}`)
      .set(headers())
      .expect(200);
    expect(gi.body.references).toEqual([]);
    expect(gi.body.deliverer == null).toBe(true);
    expect(gi.body.occurredAt == null).toBe(true);
  });
});
