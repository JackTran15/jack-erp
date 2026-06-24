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
 * E2E for the `invoice-order-listing` report ("Bảng kê hóa đơn và đơn hàng").
 * Exercises the shared report endpoints with the second report type:
 * /types lists it, /columns returns the MISA catalog (bands + placeholders +
 * dynamic payment column), /search returns one row per invoice (cancelled
 * excluded) with placeholder cells = 0/null and a totals footer.
 */
describe('Invoice order listing report (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  const ACC = 'e0000000-0000-4000-8000-0000000000ac';
  const CUST = 'e0000000-0000-4000-8000-0000000000c1';
  const REPORT = 'invoice-order-listing';

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

    await ds.query(
      `INSERT INTO customers (id, organization_id, branch_id, name, phone, code, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Khách A', '0900000001', 'KH000001', 'ACTIVE', $4::uuid, NOW(), NOW())`,
      [CUST, org, branch, user],
    );

    await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'NV000001', $2::uuid, NOW(), NOW())`,
      [org, user],
    );

    await ds.query(
      `INSERT INTO payment_accounts (id, organization_id, branch_id, payment_method, account_id, label, is_active, sort_order, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'cash', $3::uuid, 'Tiền mặt', true, 0, $4::uuid, NOW(), NOW())`,
      [org, branch, ACC, user],
    );

    const insertInvoice = (
      id: string,
      code: string,
      status: string,
      issuedAt: string,
      subtotal: number,
      discount: number,
      totalPaid: number,
      customerId: string | null,
    ) =>
      ds.query(
        `INSERT INTO invoices
           (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
            points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
            is_draft, session_id, staff_id, customer_id, issued_at, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'SALE', $6, $7,
            0, 0, 0, $8, $9,
            false, $10::uuid, $11::uuid, $12, $13::timestamptz, $11::uuid, NOW(), NOW())`,
        [
          id, org, branch, code, status, subtotal, discount, totalPaid, totalPaid,
          '00000000-0000-4000-8000-000000000001', user, customerId, issuedAt,
        ],
      );

    const I1 = 'f0000000-0000-4000-8000-000000000001';
    const I2 = 'f0000000-0000-4000-8000-000000000002';
    const I3 = 'f0000000-0000-4000-8000-000000000003';

    await insertInvoice(I1, 'HD000001', 'paid', '2026-06-03T08:30:00Z', 20000000, 2000000, 18000000, CUST);
    await insertInvoice(I2, 'HD000002', 'paid', '2026-06-04T09:00:00Z', 5000000, 0, 5000000, null);
    // cancelled — must NOT appear in the listing
    await insertInvoice(I3, 'HD000003', 'cancelled', '2026-06-05T10:00:00Z', 9000000, 0, 0, null);

    const insertPayment = (invoiceId: string, amount: number) =>
      ds.query(
        `INSERT INTO invoice_payments (id, organization_id, invoice_id, payment_method, amount, account_id, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'cash', $3, $4::uuid, $5::uuid, NOW(), NOW())`,
        [org, invoiceId, amount, ACC, user],
      );
    await insertPayment(I1, 18000000);
    await insertPayment(I2, 5000000);
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
    expect(keys).toContain(REPORT);
    expect(keys).toContain('daily-sales-summary');
    const listing = res.body.types.find((t: { key: string }) => t.key === REPORT);
    expect(listing.name).toBe('Bảng kê hóa đơn và đơn hàng');
  });

  it('returns the MISA column catalog (bands + placeholders + dynamic payment column)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/invoices/columns')
      .query({ reportType: REPORT })
      .set(headers())
      .expect(200);

    expect(res.body.summaryLabel).toBe('Tổng');
    const byCol = new Map<string, any>(res.body.columns.map((h: any) => [h.col, h]));
    expect(byCol.get('date')).toMatchObject({ name: 'Ngày', group: null });
    // status column carries select filterOptions; invoiceCode is a link
    expect(byCol.get('status')).toMatchObject({ filterKind: 'select' });
    expect(byCol.get('status').filterOptions.length).toBeGreaterThan(0);
    expect(byCol.get('invoiceCode')).toMatchObject({ link: true });
    expect(byCol.get('platform.fee')).toMatchObject({
      name: 'Phí trả sàn',
      group: { id: 'platform', name: 'Doanh thu sàn TMĐT' },
    });
    // dynamic per-payment-account column
    expect(byCol.has(`payment.method.${ACC}`)).toBe(true);
    expect(byCol.get(`payment.method.${ACC}`)).toMatchObject({ name: 'Tiền mặt' });
  });

  it('returns one row per invoice, excludes cancelled, fills placeholders, computes totals', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['date', 'time', 'invoiceCode', 'status', 'revenue.total', 'payment.cash', `payment.method.${ACC}`, 'platform.fee', 'customer', 'cashier'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      })
      .expect(201);

    expect(res.body).not.toHaveProperty('headers');
    expect(res.body.total).toBe(2); // cancelled excluded
    expect(res.body.rows).toHaveLength(2);

    expect(res.body.rows[0]).toMatchObject({
      date: '2026-06-03',
      time: '08:30',
      invoiceCode: 'HD000001',
      status: 'paid',
      'revenue.total': 18000000,
      'payment.cash': 18000000,
      [`payment.method.${ACC}`]: 18000000,
      'platform.fee': 0,
      customer: 'Khách A',
      cashier: 'NV000001',
    });

    const totals = res.body.totals;
    expect(totals['revenue.total']).toBe(23000000);
    expect(totals['payment.cash']).toBe(23000000);
    expect(totals['platform.fee']).toBe(0);
    expect(totals['date']).toBeNull();
  });

  it('applies a per-column filter post-build', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['invoiceCode', 'revenue.goods'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'revenue.goods', lte: 6000000 }],
      })
      .expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].invoiceCode).toBe('HD000002');
  });

  it('text column operator (contains) filters by invoice code', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['invoiceCode'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
        columnFilters: [{ col: 'invoiceCode', contains: 'HD000002' }],
      })
      .expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].invoiceCode).toBe('HD000002');
  });

  it('multi-status filter includes cancelled when explicitly selected', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['invoiceCode', 'status'],
        filters: {
          issuedAt: { from: '2026-06-01', to: '2026-06-30' },
          invoiceStatus: ['cancelled'],
        },
      })
      .expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].status).toBe('cancelled');
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
