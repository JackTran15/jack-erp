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
import { ReportTypeSyncService } from '../../src/modules/reporting/invoice-report/report-type-sync.service';

/**
 * E2E for the `revenue-by-item` report ("Doanh thu theo mặt hàng"). Exercises
 * the shared report endpoints with the fourth report type: /types lists it,
 * /columns returns the flat catalog, /search aggregates ONE ROW PER ITEM and
 * pivots to category / brand via `filters.groupBy`, honoring category/brand
 * scope filters, per-column filters, a totals footer, and excluding cancelled
 * invoices.
 */
describe('Revenue by item report (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  const REPORT = 'revenue-by-item';
  const CAT1 = 'e2000000-0000-4000-8000-0000000000a1'; // Nhóm Giày
  const CAT2 = 'e2000000-0000-4000-8000-0000000000a2'; // Nhóm Dép
  const IT1 = 'e2000000-0000-4000-8000-000000000011'; // Giày A · Nike
  const IT2 = 'e2000000-0000-4000-8000-000000000012'; // Giày B · Adidas
  const IT3 = 'e2000000-0000-4000-8000-000000000013'; // Dép C · Nike
  const I1 = 'e2000000-0000-4000-8000-0000000000f1';
  const I2 = 'e2000000-0000-4000-8000-0000000000f2';

  const COLUMNS = [
    'sku',
    'itemName',
    'itemCategory',
    'brand',
    'unit',
    'quantity',
    'revenue.goods',
    'revenue.total',
    'revenue.promoRate',
  ];

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await app.get(ReportTypeSyncService).onApplicationBootstrap();

    const ds = app.get(DataSource);
    const org = seed.organizationId;
    const branch = seed.branchId;
    const user = seed.userId;

    const insertCategory = (id: string, name: string) =>
      ds.query(
        `INSERT INTO inventory_item_categories (id, organization_id, name, status, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, 'ACTIVE', $4::uuid, NOW(), NOW())`,
        [id, org, name, user],
      );
    await insertCategory(CAT1, 'Nhóm Giày');
    await insertCategory(CAT2, 'Nhóm Dép');

    const insertItem = (id: string, code: string, name: string, cat: string, brand: string) =>
      ds.query(
        `INSERT INTO items (id, organization_id, code, name, unit, category_id, brand, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'pcs', $5::uuid, $6, $7::uuid, NOW(), NOW())`,
        [id, org, code, name, cat, brand, user],
      );
    await insertItem(IT1, 'SKU1', 'Giày A', CAT1, 'Nike');
    await insertItem(IT2, 'SKU2', 'Giày B', CAT1, 'Adidas');
    await insertItem(IT3, 'SKU3', 'Dép C', CAT2, 'Nike');

    const insertInvoice = (id: string, code: string, status: string, issuedAt: string) =>
      ds.query(
        `INSERT INTO invoices
           (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
            points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
            is_draft, session_id, staff_id, customer_id, issued_at, note, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SALE', 0, 0,
            0, 0, 0, 0, 0,
            false, $6::uuid, $7::uuid, NULL, $8::timestamptz, NULL, $7::uuid, NOW(), NOW())`,
        [id, org, branch, code, status, '00000000-0000-4000-8000-000000000001', user, issuedAt],
      );
    await insertInvoice(I1, 'HD000001', 'paid', '2026-06-03T08:30:00Z');
    await insertInvoice(I2, 'HD000002', 'cancelled', '2026-06-04T09:00:00Z');

    let seq = 0;
    const insertLine = (
      invoiceId: string,
      itemId: string,
      itemCode: string,
      itemName: string,
      qty: number,
      unitPrice: number,
      lineDiscount: number,
      lineTotal: number,
    ) =>
      ds.query(
        `INSERT INTO invoice_items
           (id, organization_id, invoice_id, item_id, item_code, item_name, unit,
            quantity, unit_price, unit_price_default, cost_price, line_discount, line_total,
            direction, returned_quantity, sort_order, note, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5, 'pcs',
            $6, $7, $7, 0, $8, $9,
            'OUT', 0, $10, NULL, $11::uuid, NOW(), NOW())`,
        [org, invoiceId, itemId, itemCode, itemName, qty, unitPrice, lineDiscount, lineTotal, seq++, user],
      );
    // Two lines for IT1 on the same invoice → summed at item grain.
    await insertLine(I1, IT1, 'SKU1', 'Giày A', 2, 100000, 20000, 180000);
    await insertLine(I1, IT1, 'SKU1', 'Giày A', 1, 100000, 0, 100000);
    await insertLine(I1, IT2, 'SKU2', 'Giày B', 1, 50000, 0, 50000);
    await insertLine(I1, IT3, 'SKU3', 'Dép C', 4, 30000, 0, 120000);
    // Cancelled invoice line — must be excluded.
    await insertLine(I2, IT1, 'SKU1', 'Giày A', 99, 100000, 0, 9900000);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const search = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/reports/invoices/search').set(headers()).send(body);

  /** keyed rows → { [keyCol value]: row } for easy lookup. */
  const indexBy = (rows: Record<string, any>[], keyCol: string) =>
    Object.fromEntries(rows.map((m) => [m[keyCol], m]));

  it('lists the report type in /types with its VI label', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/invoices/types')
      .set(headers())
      .expect(200);
    const me = res.body.types.find((t: { key: string }) => t.key === REPORT);
    expect(me).toBeDefined();
    expect(me.name).toBe('Doanh thu theo mặt hàng');
  });

  it('returns the flat column catalog', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/invoices/columns?reportType=${REPORT}`)
      .set(headers())
      .expect(200);
    expect(res.body.summaryLabel).toBe('Tổng');
    const cols = res.body.columns.map((h: { col: string }) => h.col);
    expect(cols).toEqual(
      expect.arrayContaining(['sku', 'itemName', 'brand', 'quantity', 'revenue.total']),
    );
    expect(res.body.columns.every((h: any) => h.group === null)).toBe(true);
  });

  it('aggregates one row per item (cancelled excluded, two lines summed)', async () => {
    const res = await search({
      reportType: REPORT,
      columns: COLUMNS,
      filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
    }).expect(201);

    expect(res.body.total).toBe(3);
    const bySku = indexBy(res.body.rows, 'sku');
    expect(bySku['SKU1']).toMatchObject({
      itemName: 'Giày A',
      itemCategory: 'Nhóm Giày',
      brand: 'Nike',
      unit: 'pcs',
      quantity: 3,
      'revenue.goods': 300000,
      'revenue.total': 280000,
      'revenue.promoRate': 6.67,
    });
    expect(bySku['SKU2']).toMatchObject({ quantity: 1, 'revenue.total': 50000 });
    expect(bySku['SKU3']).toMatchObject({ quantity: 4, 'revenue.total': 120000 });

    const totals = res.body.totals;
    expect(totals['quantity']).toBe(8);
    expect(totals['revenue.total']).toBe(450000);
    expect(totals['revenue.promoRate']).toBeNull();
  });

  it('pivots to category with statBy=group', async () => {
    const res = await search({
      reportType: REPORT,
      columns: ['itemName', 'quantity', 'revenue.total'],
      filters: { issuedAt: { from: '2026-06-01' }, statBy: 'group' },
    }).expect(201);

    expect(res.body.total).toBe(2);
    const byName = indexBy(res.body.rows, 'itemName');
    expect(byName['Nhóm Giày']).toMatchObject({ quantity: 4, 'revenue.total': 330000 });
    expect(byName['Nhóm Dép']).toMatchObject({ quantity: 4, 'revenue.total': 120000 });
  });

  it('pivots to brand with statisticByBrand', async () => {
    const res = await search({
      reportType: REPORT,
      columns: ['itemName', 'quantity', 'revenue.total'],
      filters: { issuedAt: { from: '2026-06-01' }, statisticByBrand: true },
    }).expect(201);

    expect(res.body.total).toBe(2);
    const byName = indexBy(res.body.rows, 'itemName');
    expect(byName['Nike']).toMatchObject({ quantity: 7, 'revenue.total': 400000 });
    expect(byName['Adidas']).toMatchObject({ quantity: 1, 'revenue.total': 50000 });
  });

  it('filters by category', async () => {
    const res = await search({
      reportType: REPORT,
      columns: ['sku', 'quantity'],
      filters: { issuedAt: { from: '2026-06-01' }, categoryId: CAT1 },
    }).expect(201);
    expect(res.body.total).toBe(2);
    expect(Object.keys(indexBy(res.body.rows, 'sku')).sort()).toEqual(['SKU1', 'SKU2']);
  });

  it('filters by brand', async () => {
    const res = await search({
      reportType: REPORT,
      columns: ['sku', 'quantity'],
      filters: { issuedAt: { from: '2026-06-01' }, brand: 'Nike' },
    }).expect(201);
    expect(Object.keys(indexBy(res.body.rows, 'sku')).sort()).toEqual(['SKU1', 'SKU3']);
  });

  it('applies a per-column filter post-aggregate', async () => {
    const res = await search({
      reportType: REPORT,
      columns: ['sku', 'quantity'],
      filters: { issuedAt: { from: '2026-06-01' } },
      columnFilters: [{ col: 'quantity', gte: 4 }],
    }).expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].sku).toBe('SKU3');
  });

  it('400 when filters.issuedAt.from is missing', async () => {
    await search({ reportType: REPORT, columns: ['sku'], filters: { issuedAt: {} } }).expect(400);
  });

  it('400 on an unknown column key', async () => {
    await search({
      reportType: REPORT,
      columns: ['bogus'],
      filters: { issuedAt: { from: '2026-06-01' } },
    }).expect(400);
  });
});
