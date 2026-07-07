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
 * E2E for the registry-driven inventory report contract (EPIC-06072026):
 *   GET  /reports/inventory/columns        — catalog (fixed + pivot dynamic columns)
 *   POST /reports/inventory/search         — keyed rows + columnFilters + totals over ALL rows
 *   GET  /reports/inventory/filter-options — org-scoped dropdowns (warehouse, …)
 *   CRUD /reports/inventory/templates      — column-config persistence (renamed report_templates)
 * plus legacy-endpoint regression (the old GET surface must stay untouched).
 */
describe('Inventory report v2 (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  let branchBId: string;
  let storageId: string;
  let locationId: string;
  let itemXId: string;
  let itemYId: string;
  let templateId: string;

  const STOCK_SUMMARY = 'inventory-stock-summary';
  const PIVOT = 'inventory-stock-by-store-pivot';
  const TRANSFER_BY_STORE = 'inventory-transfer-by-store';
  const BRANCH_C_ID = 'b0000000-0000-4000-8000-000000000003';

  const PERIOD = { period: { from: '2026-07-01', to: '2026-07-31' } };

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });
  const headersNoBranch = () => ({
    Authorization: authHeader(seed.accessToken),
  });

  async function insertLedgerEntry(params: {
    itemId: string;
    quantity: number;
    lineValue: number;
    postedAt: string;
    movementType: string;
  }): Promise<void> {
    await ds.query(
      `INSERT INTO stock_ledger_entries
         (id, organization_id, branch_id, item_id, location_id, movement_type,
          quantity, reference_type, reference_id, unit_cost, line_value,
          posted_at, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2, $3::uuid, $4::uuid, $5,
               $6, 'E2E_TEST', gen_random_uuid(), $7, $8,
               $9::timestamptz, $10::uuid, NOW(), NOW())`,
      [
        seed.organizationId,
        seed.branchId,
        params.itemId,
        locationId,
        params.movementType,
        params.quantity,
        Math.abs(params.lineValue / (params.quantity || 1)),
        params.lineValue,
        params.postedAt,
        seed.userId,
      ],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // Second branch of the SAME org — drives the pivot's dynamic columns.
    // The admin is assigned to it (branch scope is clamped to assignments).
    branchBId = 'b0000000-0000-4000-8000-000000000002';
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch B', 'ACTIVE', false, $3::uuid, NOW(), NOW())`,
      [branchBId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $1::uuid)`,
      [seed.userId, branchBId, seed.organizationId],
    );

    // Third branch of the SAME org the admin is NOT assigned to — must stay
    // invisible (options) and forbidden (search scope).
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, 'Branch C (unassigned)', 'ACTIVE', false, $3::uuid, NOW(), NOW())`,
      [BRANCH_C_ID, seed.organizationId, seed.userId],
    );

    // Re-login so the JWT carries both assigned branches (branchIds is baked at login).
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123',
        organizationId: seed.organizationId,
      })
      .expect(200);
    seed = { ...seed, accessToken: relogin.body.accessToken };

    // Storage + location + 2 items in the main branch.
    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'Main Warehouse', branchId: seed.branchId })
      .expect(201);
    storageId = storageRes.body.id;

    const locationRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'A-01', name: 'Shelf A1', type: 'SHELF', storageId, branchId: seed.branchId })
      .expect(201);
    locationId = locationRes.body.id;

    const itemX = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'SKU-X', name: 'Item X', unit: 'Đôi',
        purchasePrice: 100, sellingPrice: 200, isPosVisible: true, isActive: true,
      })
      .expect(201);
    itemXId = itemX.body.id;

    const itemY = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'SKU-Y', name: 'Item Y', unit: 'Cái',
        purchasePrice: 50, sellingPrice: 90, isPosVisible: true, isActive: true,
      })
      .expect(201);
    itemYId = itemY.body.id;

    // Item X: opening +10 (before period), in +5, out -3 (inside period).
    await insertLedgerEntry({
      itemId: itemXId, quantity: 10, lineValue: 1000,
      postedAt: '2026-06-15T00:00:00Z', movementType: 'PURCHASE_RECEIPT',
    });
    await insertLedgerEntry({
      itemId: itemXId, quantity: 5, lineValue: 500,
      postedAt: '2026-07-10T00:00:00Z', movementType: 'PURCHASE_RECEIPT',
    });
    await insertLedgerEntry({
      itemId: itemXId, quantity: -3, lineValue: -300,
      postedAt: '2026-07-12T00:00:00Z', movementType: 'SALE_ISSUE',
    });
    // Item Y: in +2 inside period.
    await insertLedgerEntry({
      itemId: itemYId, quantity: 2, lineValue: 100,
      postedAt: '2026-07-11T00:00:00Z', movementType: 'PURCHASE_RECEIPT',
    });

    // Foreign-org storage — must NOT leak into filter-options.
    await ds.query(
      `INSERT INTO organizations (id, organization_id, name, contact_email, status, created_by, created_at, updated_at)
       VALUES ('a0000000-0000-4000-8000-0000000000ff'::uuid, 'a0000000-0000-4000-8000-0000000000ff'::uuid,
               'Other Org', 'other@test.com', 'ACTIVE', $1::uuid, NOW(), NOW())`,
      [seed.userId],
    );
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ('b0000000-0000-4000-8000-0000000000ff'::uuid, 'a0000000-0000-4000-8000-0000000000ff'::uuid,
               'Foreign Branch', 'ACTIVE', true, $1::uuid, NOW(), NOW())`,
      [seed.userId],
    );
    await ds.query(
      `INSERT INTO storages (id, organization_id, branch_id, name, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), 'a0000000-0000-4000-8000-0000000000ff'::uuid,
               'b0000000-0000-4000-8000-0000000000ff', 'Foreign Warehouse', $1::uuid, NOW(), NOW())`,
      [seed.userId],
    );
    // App boot includes kafkajs consumer-group joins, which can take >2min on
    // a loaded local machine — far beyond the default 30s hook timeout.
  }, 300_000);

  afterAll(async () => {
    await app?.close();
    // kafkajs consumer disconnects are slow locally (see beforeAll note).
  }, 300_000);

  // ── Columns catalog ──────────────────────────────────────────────

  it('returns the stock-summary catalog with VI labels, bands and metadata', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory/columns?reportType=${STOCK_SUMMARY}`)
      .set(headers())
      .expect(200);

    expect(res.body.summaryLabel).toBe('Tổng');
    const cols: Array<{ col: string; name: string; group: { name: string } | null; filterKind: string }> =
      res.body.columns;
    const byCol = new Map(cols.map((c) => [c.col, c]));
    expect(byCol.get('name')?.name).toBe('Tên hàng hóa');
    expect(byCol.get('inQty')?.group?.name).toBe('Nhập trong kỳ');
    expect(byCol.get('inQty')?.filterKind).toBe('number');
    expect(byCol.get('supplier')?.filterKind).toBe('text');
  });

  it('emits one dynamic pivot column per org branch (branch.qty.<id>)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports/inventory/columns?reportType=${PIVOT}`)
      .set(headers())
      .expect(200);
    const dynamicCols = res.body.columns
      .map((c: { col: string }) => c.col)
      .filter((c: string) => c.startsWith('branch.qty.'));
    expect(dynamicCols).toEqual(
      expect.arrayContaining([`branch.qty.${seed.branchId}`, `branch.qty.${branchBId}`]),
    );
    expect(dynamicCols).toHaveLength(2);
  });

  it('400s on an unknown report type', async () => {
    await request(app.getHttpServer())
      .get('/reports/inventory/columns?reportType=nope')
      .set(headers())
      .expect(400);
  });

  // ── Search ───────────────────────────────────────────────────────

  it('computes opening/in/out/ending and totals over ALL rows (stable across pages)', async () => {
    const body = {
      reportType: STOCK_SUMMARY,
      columns: ['sku', 'name', 'openingQty', 'inQty', 'outQty', 'endingQty', 'endingValue'],
      filters: PERIOD,
      page: 1,
      limit: 1,
    };
    const page1 = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send(body)
      .expect(201);

    expect(page1.body.total).toBe(2);
    expect(page1.body.rows).toHaveLength(1);
    // Totals over BOTH rows although the page holds one.
    expect(page1.body.totals.inQty).toBe(7);
    expect(page1.body.totals.outQty).toBe(3);
    expect(page1.body.totals.openingQty).toBe(10);

    const page2 = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({ ...body, page: 2 })
      .expect(201);
    expect(page2.body.totals).toEqual(page1.body.totals);

    const rows = [...page1.body.rows, ...page2.body.rows];
    const itemX = rows.find((r: { sku: string }) => r.sku === 'SKU-X');
    expect(itemX).toMatchObject({
      openingQty: 10,
      inQty: 5,
      outQty: 3,
      endingQty: 12,
      endingValue: 1200,
    });
  });

  it('applies text and numeric per-column filters', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['sku', 'inQty'],
        filters: PERIOD,
        columnFilters: [
          { col: 'sku', contains: 'sku-' },
          { col: 'inQty', gte: 3 },
        ],
      })
      .expect(201);
    expect(res.body.total).toBe(1);
    expect(res.body.rows[0].sku).toBe('SKU-X');
  });

  it('rejects unknown columns (400) and non-permitted store ids (403)', async () => {
    await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({ reportType: STOCK_SUMMARY, columns: ['nope'], filters: PERIOD })
      .expect(400);

    // Foreign-org branch — outside the actor's permitted set → 403.
    await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['sku'],
        filters: {
          ...PERIOD,
          store: { scope: 'group', storeIds: ['b0000000-0000-4000-8000-0000000000ff'] },
        },
      })
      .expect(403);

    // Same-org branch the actor is NOT assigned to → also 403.
    await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        columns: ['sku'],
        filters: {
          ...PERIOD,
          store: { scope: 'group', storeIds: [BRANCH_C_ID] },
        },
      })
      .expect(403);
  });

  it('clamps store options and warehouse options to the assigned branches', async () => {
    const stores = await request(app.getHttpServer())
      .get('/reports/inventory/filter-options?type=store')
      .set(headers())
      .expect(200);
    const storeIds = stores.body.map((o: { value: string }) => o.value);
    expect(storeIds).toEqual(
      expect.arrayContaining([seed.branchId, branchBId]),
    );
    expect(storeIds).not.toContain(BRANCH_C_ID);

    // Requesting a non-permitted branch yields no warehouses.
    const foreign = await request(app.getHttpServer())
      .get(`/reports/inventory/filter-options?type=warehouse&branchIds=${BRANCH_C_ID}`)
      .set(headers())
      .expect(200);
    expect(foreign.body).toEqual([]);

    // Restricting to the main branch returns its storage only.
    const main = await request(app.getHttpServer())
      .get(`/reports/inventory/filter-options?type=warehouse&branchIds=${seed.branchId}`)
      .set(headers())
      .expect(200);
    expect(main.body.map((o: { label: string }) => o.label)).toContain(
      'Main Warehouse',
    );
  });

  it('transfer-by-store defaults the source branch to the actor branch (JWT active branch)', async () => {
    // Even without X-Branch-Id the JWT carries an active branch, so the
    // report resolves sourceBranchId = actor.branchId and runs (empty data).
    // The hard-400 path (no filter AND no actor branch) is unit-covered in
    // transfer-by-store.report.spec.ts.
    const res = await request(app.getHttpServer())
      .post('/reports/inventory/search')
      .set(headersNoBranch())
      .send({
        reportType: TRANSFER_BY_STORE,
        columns: ['sku', 'targetBranch', 'outQty'],
        filters: PERIOD,
      })
      .expect(201);
    expect(res.body).toMatchObject({ rows: [], total: 0 });
  });

  // ── Filter options ───────────────────────────────────────────────

  it('serves org-scoped warehouse options (no cross-org leakage)', async () => {
    const res = await request(app.getHttpServer())
      .get('/reports/inventory/filter-options?type=warehouse')
      .set(headers())
      .expect(200);
    const labels = res.body.map((o: { label: string }) => o.label);
    expect(labels).toContain('Main Warehouse');
    expect(labels).not.toContain('Foreign Warehouse');
  });

  // ── Templates (renamed report_templates table) ───────────────────

  it('creates a template validated against the inventory catalog (incl. dynamic pivot keys)', async () => {
    const res = await request(app.getHttpServer())
      .post('/reports/inventory/templates')
      .set(headers())
      .send({
        reportType: PIVOT,
        name: 'Mặc định',
        columns: [
          { col: 'sku', visible: true, frozen: true, order: 9 },
          { col: `branch.qty.${branchBId}`, visible: true, frozen: false },
          { col: 'total', visible: false, frozen: false },
        ],
      })
      .expect(201);

    expect(res.body.columns).toEqual([
      { col: 'sku', displayName: null, visible: true, frozen: true, order: 0 },
      { col: `branch.qty.${branchBId}`, displayName: null, visible: true, frozen: false, order: 1 },
      { col: 'total', displayName: null, visible: false, frozen: false, order: 2 },
    ]);
    templateId = res.body.id;
  });

  it('round-trips get → update → list → delete', async () => {
    const got = await request(app.getHttpServer())
      .get(`/reports/inventory/templates/${templateId}`)
      .set(headers())
      .expect(200);
    expect(got.body.reportType).toBe(PIVOT);

    const patched = await request(app.getHttpServer())
      .patch(`/reports/inventory/templates/${templateId}`)
      .set(headers())
      .send({ columns: [{ col: 'sku', visible: true, frozen: false }] })
      .expect(200);
    expect(patched.body.columns).toHaveLength(1);

    const list = await request(app.getHttpServer())
      .get(`/reports/inventory/templates?reportType=${PIVOT}`)
      .set(headers())
      .expect(200);
    expect(list.body.some((t: { id: string }) => t.id === templateId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`/reports/inventory/templates/${templateId}`)
      .set(headers())
      .expect(200);
  });

  it('rejects template columns outside the inventory catalog', async () => {
    await request(app.getHttpServer())
      .post('/reports/inventory/templates')
      .set(headers())
      .send({
        reportType: STOCK_SUMMARY,
        name: 'Bad',
        columns: [{ col: 'branch.qty.nope', visible: true, frozen: false }],
      })
      .expect(400);
  });

  // ── Legacy surface regression ────────────────────────────────────

  it('legacy GET endpoints keep their envelope and data', async () => {
    const legacy = await request(app.getHttpServer())
      .get('/reports/inventory/stock-summary?preset=custom&startDate=2026-07-01&endDate=2026-07-31')
      .set(headers())
      .expect(200);
    expect(legacy.body).toHaveProperty('data');
    expect(legacy.body).toHaveProperty('total');
    const legacyX = legacy.body.data.find((r: { sku: string }) => r.sku === 'SKU-X');
    expect(legacyX).toMatchObject({ openingQty: 10, inQty: 5, outQty: 3 });

    const transfer = await request(app.getHttpServer())
      .get('/reports/inventory/transfer-summary?preset=custom&startDate=2026-07-01&endDate=2026-07-31')
      .set(headers())
      .expect(200);
    expect(transfer.body).toHaveProperty('data');
  });
});
