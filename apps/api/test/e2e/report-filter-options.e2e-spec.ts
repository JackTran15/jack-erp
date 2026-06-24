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
 * E2E for the shared dropdown filter-options endpoint + multi-branch
 * consolidation on /search. Seeds a second branch and one invoice per branch,
 * then exercises GET /reports/invoices/filter-options (dynamic + enum types)
 * and POST /reports/invoices/search with store.scope = all | group.
 */
describe('Report filter-options + consolidation (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;

  const BRANCH2 = 'b0000000-0000-4000-8000-0000000000b2';
  const CUST = 'e0000000-0000-4000-8000-0000000000ca';
  const REPORT = 'invoice-order-listing';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    await app.get(ReportTypeSyncService).onApplicationBootstrap();

    const ds = app.get(DataSource);
    const org = seed.organizationId;
    const b1 = seed.branchId;
    const user = seed.userId;

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch Two', 'ACTIVE', false, $3::uuid, NOW(), NOW())`,
      [BRANCH2, org, user],
    );

    await ds.query(
      `INSERT INTO customers (id, organization_id, branch_id, name, phone, code, status, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Khách Chuỗi', '0911222333', 'KH000099', 'ACTIVE', $4::uuid, NOW(), NOW())`,
      [CUST, org, b1, user],
    );

    const insertInvoice = (
      id: string,
      code: string,
      branchId: string,
      subtotal: number,
      totalPaid: number,
    ) =>
      ds.query(
        `INSERT INTO invoices
           (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
            points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
            is_draft, session_id, staff_id, customer_id, issued_at, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'paid', 'SALE', $5, 0,
            0, 0, 0, $6, $6,
            false, $7::uuid, $8::uuid, NULL, '2026-06-03T08:30:00Z', $8::uuid, NOW(), NOW())`,
        [
          id, org, branchId, code, subtotal, totalPaid,
          '00000000-0000-4000-8000-000000000001', user,
        ],
      );

    await insertInvoice('fa000000-0000-4000-8000-000000000001', 'HD-B1-1', b1, 10000000, 10000000);
    await insertInvoice('fa000000-0000-4000-8000-000000000002', 'HD-B2-1', BRANCH2, 7000000, 7000000);
  });

  afterAll(async () => {
    await app.close();
  });

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const options = (query: Record<string, string>) =>
    request(app.getHttpServer())
      .get('/reports/invoices/filter-options')
      .query(query)
      .set(headers());

  it('store: returns org branches with metadata.branchId', async () => {
    const res = await options({ type: 'store' }).expect(200);
    const ids = res.body.map((o: { value: string }) => o.value);
    expect(ids).toContain(seed.branchId);
    expect(ids).toContain(BRANCH2);
    const main = res.body.find((o: { value: string }) => o.value === seed.branchId);
    expect(main.metadata.branchId).toBe(seed.branchId);
  });

  it('cashier: returns the seeded user (value = user id)', async () => {
    const res = await options({ type: 'cashier' }).expect(200);
    const me = res.body.find((o: { value: string }) => o.value === seed.userId);
    expect(me).toBeDefined();
    expect(me.label).toBe('User Admin'); // [lastName, firstName]
  });

  it('cashier: search narrows by name', async () => {
    const res = await options({ type: 'cashier', search: 'admin' }).expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    const none = await options({ type: 'cashier', search: 'zzzznomatch' }).expect(200);
    expect(none.body).toHaveLength(0);
  });

  it('customer: search matches name', async () => {
    const res = await options({ type: 'customer', search: 'Chuỗi' }).expect(200);
    expect(res.body.find((o: { value: string }) => o.value === CUST)).toBeDefined();
  });

  it('invoiceStatus: returns the real backend statuses', async () => {
    const res = await options({ type: 'invoiceStatus' }).expect(200);
    const values = res.body.map((o: { value: string }) => o.value);
    expect(values).toEqual(['draft', 'pending', 'paid', 'debt', 'partial_debt', 'cancelled']);
  });

  it('statBy: returns item | parent | group', async () => {
    const res = await options({ type: 'statBy' }).expect(200);
    expect(res.body.map((o: { value: string }) => o.value)).toEqual(['item', 'parent', 'group']);
  });

  it('unknown type → 400', async () => {
    await options({ type: 'bogus' }).expect(400);
  });

  // ---- consolidation ----

  const search = (filters: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['invoiceCode', 'revenue.total'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' }, ...filters },
      });

  it('store.scope=group over both branches sums both invoices', async () => {
    const res = await search({
      store: { scope: 'group', storeIds: [seed.branchId, BRANCH2] },
    }).expect(201);
    expect(res.body.total).toBe(2);
    expect(res.body.totals['revenue.total']).toBe(17000000);
  });

  it('store.scope=group over a single branch isolates it', async () => {
    const res = await search({
      store: { scope: 'group', storeIds: [BRANCH2] },
    }).expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].invoiceCode).toBe('HD-B2-1');
    expect(res.body.totals['revenue.total']).toBe(7000000);
  });

  it('store.scope=all consolidates the whole org', async () => {
    const res = await search({ store: { scope: 'all', storeIds: [] } }).expect(201);
    expect(res.body.total).toBe(2);
    expect(res.body.totals['revenue.total']).toBe(17000000);
  });
});
