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
 * E2E for the `invoice-item-revenue-detail` report
 * ("Chi tiết doanh thu theo hóa đơn và mặt hàng").
 * Exercises the shared report endpoints with the third report type:
 * /types lists it, /columns returns the flat line-item catalog, /search returns
 * ONE ROW PER INVOICE LINE ITEM (cancelled invoices excluded) with inline
 * relations (customer/category/supplier/cashier), the derived gross line amount,
 * placeholder cells = 0/null, and a totals footer.
 */
describe('Invoice item revenue detail report (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  const REPORT = 'invoice-item-revenue-detail';
  const CG = 'e1000000-0000-4000-8000-0000000000c0';
  const CUST = 'e1000000-0000-4000-8000-0000000000c1';
  const CAT = 'e1000000-0000-4000-8000-0000000000a0';
  const IT1 = 'e1000000-0000-4000-8000-000000000011';
  const IT2 = 'e1000000-0000-4000-8000-000000000012';
  const PROV = 'e1000000-0000-4000-8000-0000000000d0';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);

    // synchronize(true) in resetDatabase wipes the report_types seeded at boot —
    // repopulate via the real sync path so /types reflects the code registry.
    await app.get(ReportTypeSyncService).onApplicationBootstrap();

    const ds = app.get(DataSource);
    const org = seed.organizationId;
    const branch = seed.branchId;
    const user = seed.userId;

    // Cashier profile for invoice.staffId = user (name comes from the seeded user).
    await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'NV000001', $2::uuid, NOW(), NOW())`,
      [org, user],
    );

    await ds.query(
      `INSERT INTO customer_groups (id, organization_id, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Khách VIP', $3::uuid, NOW(), NOW())`,
      [CG, org, user],
    );
    await ds.query(
      `INSERT INTO customers (id, organization_id, branch_id, name, phone, code, status, group_id, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Khách A', '0900000001', 'KH000001', 'ACTIVE', $4::uuid, $5::uuid, NOW(), NOW())`,
      [CUST, org, branch, CG, user],
    );

    await ds.query(
      `INSERT INTO inventory_item_categories (id, organization_id, name, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Giày dép', 'ACTIVE', $3::uuid, NOW(), NOW())`,
      [CAT, org, user],
    );
    const insertItem = (id: string, code: string, categoryId: string | null) =>
      ds.query(
        `INSERT INTO items (id, organization_id, code, name, unit, category_id, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3, $3, 'đôi', $4::uuid, $5::uuid, NOW(), NOW())`,
        [id, org, code, categoryId, user],
      );
    await insertItem(IT1, 'ITEM001', CAT);
    await insertItem(IT2, 'ITEM002', null);

    await ds.query(
      `INSERT INTO inventory_providers (id, organization_id, code, name, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'NCC01', 'NCC ABC', $3::uuid, NOW(), NOW())`,
      [PROV, org, user],
    );
    await ds.query(
      `INSERT INTO item_providers (id, organization_id, item_id, provider_id, is_primary, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, true, $4::uuid, NOW(), NOW())`,
      [org, IT1, PROV, user],
    );

    const insertInvoice = (
      id: string,
      code: string,
      status: string,
      issuedAt: string,
      customerId: string | null,
    ) =>
      ds.query(
        `INSERT INTO invoices
           (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
            points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
            is_draft, session_id, staff_id, customer_id, issued_at, note, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SALE', 0, 0,
            0, 0, 0, 0, 0,
            false, $6::uuid, $7::uuid, $8, $9::timestamptz, 'inv note', $7::uuid, NOW(), NOW())`,
        [
          id, org, branch, code, status,
          '00000000-0000-4000-8000-000000000001', user, customerId, issuedAt,
        ],
      );

    const I1 = 'f1000000-0000-4000-8000-000000000001';
    const I2 = 'f1000000-0000-4000-8000-000000000002';
    await insertInvoice(I1, 'HD000001', 'paid', '2026-06-03T08:30:00Z', CUST);
    // cancelled — its line items must NOT appear
    await insertInvoice(I2, 'HD000002', 'cancelled', '2026-06-04T09:00:00Z', null);

    const insertLine = (
      invoiceId: string,
      itemId: string,
      itemCode: string,
      itemName: string,
      qty: number,
      unitPrice: number,
      lineDiscount: number,
      lineTotal: number,
      sortOrder: number,
      note: string | null,
    ) =>
      ds.query(
        `INSERT INTO invoice_items
           (id, organization_id, invoice_id, item_id, item_code, item_name, unit,
            quantity, unit_price, unit_price_default, cost_price, line_discount, line_total,
            direction, returned_quantity, sort_order, note, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $5, 'đôi',
            $6, $7, $7, 0, $8, $9,
            'OUT', 0, $10, $11, $12::uuid, NOW(), NOW())`,
        [org, invoiceId, itemId, itemCode, itemName, qty, unitPrice, lineDiscount, lineTotal, sortOrder, note, user],
      );
    await insertLine(I1, IT1, 'SKU-IT1', 'Giày', 2, 1200000, 200000, 2200000, 0, 'line note');
    await insertLine(I1, IT2, 'SKU-IT2', 'Dép', 1, 500000, 0, 500000, 1, null);
    await insertLine(I2, IT1, 'SKU-IT1', 'Giày', 5, 1200000, 0, 6000000, 0, null);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  it('lists the report type in /types', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/invoices/types')
      .set(headers())
      .expect(200);
    const keys = res.body.types.map((t: { key: string }) => t.key);
    expect(keys).toEqual(
      expect.arrayContaining(['daily-sales-summary', 'invoice-order-listing', REPORT]),
    );
    const me = res.body.types.find((t: { key: string }) => t.key === REPORT);
    expect(me.name).toBe('Chi tiết doanh thu theo hóa đơn và mặt hàng');
  });

  it('returns a flat line-item column catalog (no bands, no dynamic payment columns)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/invoices/columns')
      .query({ reportType: REPORT })
      .set(headers())
      .expect(200);

    const byCol = new Map<string, any>(res.body.headers.map((h: any) => [h.col, h]));
    expect(byCol.get('date')).toMatchObject({ name: 'Ngày', group: null });
    expect(byCol.get('sku')).toMatchObject({ name: 'Mã SKU', group: null });
    expect(byCol.get('lineRevenue')).toMatchObject({ name: 'Doanh thu', group: null });
    expect(byCol.get('supplier')).toMatchObject({ name: 'Nhà cung cấp' });
    expect(res.body.headers.every((h: any) => h.group === null)).toBe(true);
    expect([...byCol.keys()].some((k) => k.startsWith('payment.method.'))).toBe(false);
  });

  it('returns one row per line item, excludes cancelled, fills placeholders, computes totals', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: [
          'date', 'time', 'invoiceCode', 'sku', 'itemName', 'itemCategory', 'quantity',
          'unitPrice', 'lineAmount', 'lineRevenue', 'revenue.promoPoints', 'reference',
          'customer', 'customerCode', 'customerGroup', 'cashier', 'cashierCode',
          'supplier', 'storeCode', 'itemNote',
        ],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      })
      .expect(201);

    expect(res.body).not.toHaveProperty('headers');
    expect(res.body.total).toBe(2); // 2 lines on the paid invoice; cancelled invoice excluded
    expect(res.body.dataRaw).toHaveLength(2);

    const row0 = Object.fromEntries(res.body.dataRaw[0].map((c: any) => [c.col, c.value]));
    expect(row0).toMatchObject({
      date: '2026-06-03',
      time: '08:30',
      invoiceCode: 'HD000001',
      sku: 'SKU-IT1',
      itemName: 'Giày',
      itemCategory: 'Giày dép',
      quantity: 2,
      unitPrice: 1200000,
      lineAmount: 2400000, // 2 * 1.2m
      lineRevenue: 2200000,
      'revenue.promoPoints': 0, // placeholder
      reference: null, // placeholder
      customer: 'Khách A',
      customerCode: 'KH000001',
      customerGroup: 'Khách VIP',
      cashier: 'User Admin',
      cashierCode: 'NV000001',
      supplier: 'NCC ABC',
      storeCode: 'Main Branch',
      itemNote: 'line note',
    });

    const row1 = Object.fromEntries(res.body.dataRaw[1].map((c: any) => [c.col, c.value]));
    expect(row1).toMatchObject({
      sku: 'SKU-IT2',
      itemCategory: null,
      supplier: null,
      lineAmount: 500000,
      itemNote: null,
    });

    const totals = Object.fromEntries(res.body.totals.map((c: any) => [c.col, c.value]));
    expect(totals['quantity']).toBe(3);
    expect(totals['lineAmount']).toBe(2900000);
    expect(totals['lineRevenue']).toBe(2700000);
    expect(totals['unitPrice']).toBeNull();
    expect(totals['date']).toBeNull();
  });

  it('applies a per-column filter post-build', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['sku', 'quantity'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'quantity', gte: 2 }],
      })
      .expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.dataRaw[0][0]).toMatchObject({ col: 'sku', value: 'SKU-IT1' });
  });

  it('400 when filters.issuedAt.from is missing', async () => {
    await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({ reportType: REPORT, columns: ['date'], filters: { issuedAt: {} } })
      .expect(400);
  });

  it('400 on an unknown column key', async () => {
    await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({ reportType: REPORT, columns: ['bogus'], filters: { issuedAt: { from: '2026-06-01' } } })
      .expect(400);
  });
});
