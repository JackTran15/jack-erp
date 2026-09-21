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
import { REPORT_PERMISSION_KEYS } from '@erp/shared-interfaces';
import { ReportTypeSyncService } from '../../src/modules/reporting/invoice-report/report-type-sync.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { grantPermissions } from './setup/cash-fund-fixture';

/**
 * Feature 2026092101-untracked-location-summary-report, UOW-02.
 *
 * "Mã vị trí" on "Chi tiết doanh thu theo hóa đơn và mặt hàng" is the item's
 * current warehouse shelf, resolved by the shared resolveItemWarehouseLocations.
 * That resolver used to keep a shelf only while stock_balances.quantity > 0, so
 * the cell went blank the moment the last unit on a tracked shelf was sold. The
 * unit spec mocks the query builder; this suite lets Postgres evaluate the
 * predicate list: tracked at 0 → reported, stopped at 0 → still dropped.
 */
describe('Revenue detail "Mã vị trí" for a tracked empty shelf (E2E)', () => {
  let app: INestApplication;
  let seed: SeedResult;
  let ds: DataSource;

  const REPORT = 'invoice-item-revenue-detail';
  const INVOICE = 'f2000000-0000-4000-8000-000000000001';

  let storageId: string;
  let locK: string; // K09.01 — tracked, quantity 0, no preferred shelf
  let locE: string; // E01.01 — D's pair here is stopped

  let itemK: string; // AC-06
  let itemD: string; // AC-07

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

  interface ReportRow {
    invoiceCode: string;
    sku: string;
    locationCode: string | null;
    locationName: string | null;
    quantity: number;
  }

  async function searchRows(): Promise<ReportRow[]> {
    const res = await request(app.getHttpServer())
      .post('/reports/invoices/search')
      .set(headers())
      .send({
        reportType: REPORT,
        columns: ['invoiceCode', 'sku', 'locationCode', 'locationName', 'quantity'],
        filters: { issuedAt: { from: '2026-06-01', to: '2026-06-30' } },
      })
      .expect(201);
    return res.body.rows;
  }

  const rowOf = (rows: ReportRow[], sku: string) => {
    const row = rows.find((r) => r.sku === sku);
    expect(row).toBeDefined();
    return row!;
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    // synchronize(true) in resetDatabase wipes the report_types seeded at boot —
    // repopulate via the real sync path so /search knows the report type.
    await app.get(ReportTypeSyncService).onApplicationBootstrap();

    const org = seed.organizationId;
    const branch = seed.branchId;
    const user = seed.userId;

    // seedBaseData grants the group-level reporting keys only; ReportPermissionGuard
    // also wants the per-report key, so attach it to the seeded admin role.
    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [org],
    );
    await grantPermissions(ds, roleRows[0].id, [REPORT_PERMISSION_KEYS[REPORT]!]);
    await app.get(RbacService).invalidateOrgPermissions(org);

    // Cashier profile for invoice.staffId = user — the report resolves it eagerly.
    await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1::uuid, $2::uuid, 'NV000001', $2::uuid, NOW(), NOW())`,
      [org, user],
    );

    // A warehouse, not the showroom: the resolver only reports warehouse
    // shelves for this report, and the tracking endpoint refuses showroom pairs.
    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'WH revenue-location', branchId: branch })
      .expect(201);
    storageId = storageRes.body.id;

    locK = await createLocation('K09.01', 'Kệ K09.01');
    locE = await createLocation('E01.01', 'Kệ E01.01');

    itemK = await createItem('RDL-K', 'Item K');
    itemD = await createItem('RDL-D', 'Item D');

    // No item_storage_locations rows anywhere — the case under test is
    // "no preferred shelf, only a balance row". Every quantity is 0.
    await putBalance(itemK, locK, 0);
    await putBalance(itemD, locE, 0);
    await putBalance(itemD, locK, 0);
    await setTracking([{ itemId: itemD, locationId: locE }], false);

    await ds.query(
      `INSERT INTO invoices
         (id, organization_id, branch_id, code, status, type, subtotal, discount_amount,
          points_redeemed, points_discount_amount, deposit_amount, amount_due, total_paid,
          is_draft, session_id, staff_id, customer_id, issued_at, note, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'HD000101', 'paid', 'SALE', 0, 0,
          0, 0, 0, 0, 0,
          false, $4::uuid, $5::uuid, NULL, '2026-06-10T08:30:00Z'::timestamptz, NULL, $5::uuid, NOW(), NOW())`,
      [INVOICE, org, branch, '00000000-0000-4000-8000-000000000001', user],
    );
    const insertLine = (itemId: string, itemCode: string, sortOrder: number) =>
      ds.query(
        `INSERT INTO invoice_items
           (id, organization_id, invoice_id, item_id, item_code, item_name, unit,
            quantity, unit_price, unit_price_default, cost_price, line_discount, line_total,
            direction, returned_quantity, sort_order, note, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1::uuid, $2::uuid, $3::uuid, $4, $4, 'PCS',
            1, 100, 100, 50, 0, 100,
            'OUT', 0, $5, NULL, $6::uuid, NOW(), NOW())`,
        [org, INVOICE, itemId, itemCode, sortOrder, user],
      );
    await insertLine(itemK, 'RDL-K', 0);
    await insertLine(itemD, 'RDL-D', 1);
    // createTestApp + resetDatabase + seedBaseData alone runs into the minutes
    // on a cold local stack; the suite's 30s default is nowhere near enough.
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('AC-06 — tracked, empty, no preferred shelf → still reported', () => {
    it('prints K09.01 for item K', async () => {
      const rows = await searchRows();

      expect(rowOf(rows, 'RDL-K')).toMatchObject({
        invoiceCode: 'HD000101',
        locationCode: 'K09.01',
        locationName: 'Kệ K09.01',
      });
    });
  });

  describe('AC-07 — stopped pair still excluded; tracked pairs still joined', () => {
    it('prints only K09.01 for item D although E01.01 sits at the same quantity 0', async () => {
      const rows = await searchRows();

      expect(rowOf(rows, 'RDL-D')).toMatchObject({
        locationCode: 'K09.01',
        locationName: 'Kệ K09.01',
      });
    });

    it('re-tracking E01.01 joins it back in, ordered by location code', async () => {
      await setTracking([{ itemId: itemD, locationId: locE }], true);

      const rows = await searchRows();

      expect(rowOf(rows, 'RDL-D')).toMatchObject({
        locationCode: 'E01.01, K09.01',
        locationName: 'Kệ E01.01, Kệ K09.01',
      });
    });
  });
});
