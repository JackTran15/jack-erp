import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  authHeader,
  createTestApp,
  request,
  resetDatabase,
  seedBaseData,
  SeedResult,
} from './setup/test-app';
import { MAX_REPORT_ROWS } from '../../src/modules/reporting/report-core/row-cap.util';

/**
 * The reported defect, end to end.
 *
 * "Report exceeds 50000 rows (74515); narrow the period or filters" — returned
 * for a request asking for 50 rows, because every paged inventory report pulled
 * its whole result set into memory to filter, total and page it in JS.
 *
 * These tests seed past the cap so the assertion is about real scale rather than
 * about a mocked count, and drive the actual HTTP endpoints.
 */
const OVER_CAP_ROWS = MAX_REPORT_ROWS + 2_000;

const REPORT_TYPES = [
  'inventory-stock-summary',
  'inventory-stock-summary-by-store',
  'inventory-stock-quantity-detail',
  'inventory-stock-by-store-pivot',
  'inventory-document-detail',
  'inventory-transfer-by-store',
  'inventory-temp-warehouse-out',
] as const;

/** One column that exists on every report, so one body shape drives all seven. */
const COLUMNS: Record<string, string[]> = {
  'inventory-stock-summary': ['sku', 'name', 'endingQty'],
  'inventory-stock-summary-by-store': ['sku', 'name', 'endingQty'],
  'inventory-stock-quantity-detail': ['sku', 'name', 'endingQty'],
  'inventory-stock-by-store-pivot': ['sku', 'name', 'total'],
  'inventory-document-detail': ['sku', 'name', 'inQty'],
  'inventory-transfer-by-store': ['sku', 'name', 'outQty'],
  'inventory-temp-warehouse-out': ['sku', 'name', 'outQty'],
};

describe('Inventory reports — row cap (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    ds = app.get(DataSource);
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await seedOverCapLedger();
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  /**
   * Seeds more than `MAX_REPORT_ROWS` distinct (item, location) pairs.
   *
   * Written as set-based INSERTs rather than a loop: the point is to reach real
   * scale, and inserting 52,000 rows one at a time would make the suite unusable.
   */
  async function seedOverCapLedger(): Promise<void> {
    const storageId = 'e0000000-0000-4000-8000-000000000001';
    const locationId = 'e0000000-0000-4000-8000-000000000002';

    await ds.query(
      `INSERT INTO storages (id, organization_id, branch_id, name, is_default_receiving, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, 'Kho test', TRUE, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [storageId, seed.organizationId, seed.branchId, seed.userId],
    );
    await ds.query(
      `INSERT INTO locations (id, organization_id, storage_id, code, name, type, is_default, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2, $3::uuid, 'A01', 'Kệ A01', 'SHELF', TRUE, $4, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [locationId, seed.organizationId, storageId, seed.userId],
    );

    // One item per row, so (item × location) pairs exceed the cap.
    await ds.query(
      `INSERT INTO items (id, organization_id, created_by, created_at, updated_at,
                          code, name, unit, is_active, selling_price, purchase_price,
                          is_pos_visible, is_gold_silver, manage_barcode_per_unit)
       SELECT gen_random_uuid(), $1, $2, NOW(), NOW(),
              'CAP-' || g, 'Hàng ' || g, 'Cái', TRUE, 1000, 800, TRUE, FALSE, FALSE
       FROM generate_series(1, $3) g`,
      [seed.organizationId, seed.userId, OVER_CAP_ROWS],
    );

    await ds.query(
      `INSERT INTO stock_ledger_entries (id, organization_id, created_by, created_at, updated_at,
                                         item_id, location_id, branch_id, movement_type,
                                         quantity, line_value, reference_type, reference_id, posted_at)
       SELECT gen_random_uuid(), $1::varchar, $2::varchar, NOW(), NOW(),
              i.id, $3::uuid, $4::varchar, 'PURCHASE_RECEIPT',
              5, 4000, 'SEED', gen_random_uuid(), NOW() - INTERVAL '1 day'
       FROM items i
       WHERE i.organization_id = $1::varchar AND i.code LIKE 'CAP-%'`,
      [seed.organizationId, seed.userId, locationId, seed.branchId],
    );
  }

  function search(reportType: string, extra: Record<string, unknown> = {}) {
    return request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set('Authorization', authHeader(seed.accessToken))
      .send({
        reportType,
        columns: COLUMNS[reportType],
        filters: { preset: 'this_year' },
        page: 1,
        limit: 50,
        ...extra,
      });
  }

  it('seeds past the cap, so the assertions below mean something', async () => {
    const [{ count }] = await ds.query(
      `SELECT COUNT(DISTINCT (item_id, location_id))::int AS count
       FROM stock_ledger_entries WHERE organization_id = $1`,
      [seed.organizationId],
    );
    expect(Number(count)).toBeGreaterThan(MAX_REPORT_ROWS);
  });

  // `/search` is a POST without an explicit @HttpCode, so Nest answers 201.
  // What matters is that it is not the 400 the cap used to produce.
  //
  // Scope of this one: the fixture seeds `stock_ledger_entries`, which is what
  // the three stock-period reports read. The pivot reads `stock_balances`, and
  // document-detail / transfer-by-store / temp-warehouse-out read their own
  // document tables — none of those are seeded, so those four prove the request
  // is accepted and routed, not that they page correctly at scale. The
  // assertions below that do turn on real volume all target stock-summary.
  it.each(REPORT_TYPES)('%s answers a page instead of 400', async (reportType) => {
    const res = await search(reportType);

    expect(res.status).toBeLessThan(300);
    expect(JSON.stringify(res.body)).not.toContain('exceeds');
  });

  it('returns one page of the over-cap set, and counts the whole of it', async () => {
    // The exact request from the bug report: 50 rows of a set far past the cap.
    const res = await search('inventory-stock-summary');

    expect(res.status).toBeLessThan(300);
    expect(res.body.rows).toHaveLength(50);
    expect(res.body.total).toBeGreaterThan(MAX_REPORT_ROWS);
  });

  it('keeps the footer describing the whole filtered set, not the page', async () => {
    const page1 = await search('inventory-stock-summary', { page: 1, limit: 50 });
    const page2 = await search('inventory-stock-summary', { page: 2, limit: 50 });

    expect(page1.body.total).toBe(page2.body.total);
    expect(page1.body.totals).toEqual(page2.body.totals);

    const skus1 = page1.body.rows.map((r: { sku: string }) => r.sku);
    const skus2 = page2.body.rows.map((r: { sku: string }) => r.sku);
    expect(skus1.filter((s: string) => skus2.includes(s))).toHaveLength(0);
  });

  it('narrows the whole set when a column filter is applied, not just the page', async () => {
    const all = await search('inventory-stock-summary');
    const filtered = await search('inventory-stock-summary', {
      columnFilters: [{ col: 'sku', equals: 'CAP-1' }],
    });

    expect(filtered.status).toBeLessThan(300);
    expect(filtered.body.total).toBe(1);
    expect(filtered.body.total).toBeLessThan(all.body.total);
  });

  it('still refuses to export the whole thing (ADR-01)', async () => {
    // The cap did not disappear; it moved to where materialising is unavoidable.
    const res = await request(app.getHttpServer())
      .post('/reports/inventory/export')
      .set('Authorization', authHeader(seed.accessToken))
      .send({
        reportType: 'inventory-stock-summary',
        columns: COLUMNS['inventory-stock-summary'],
        filters: { preset: 'this_year' },
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('exceeds');
  });
});
