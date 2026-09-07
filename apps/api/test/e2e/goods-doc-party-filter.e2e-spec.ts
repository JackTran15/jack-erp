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
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * T-02-01 (UOW-02, AC-10): `counterpartyNameSql` (and the independent
 * `TRANSPORTER_NAME_SUBQUERY` in stock-transfer search) compares
 * `users.organization_id` (uuid) with `<alias>.organization_id` (varchar) with
 * no cast in the `employee` CASE arm. Postgres type-checks every CASE branch
 * at plan time, so the statement is rejected before any row is read — every
 * keystroke in the "Đối tượng" filter 500s, on all three grids, regardless of
 * whether any row actually has `counterparty_kind = 'employee'`.
 *
 * The two specs that already cover this code (`search-goods-receipts-v2.
 * handler.spec.ts`, `counterparty-name.util.spec.ts`) both mock QueryBuilder
 * and assert `stringContaining(...)`, so a SQL type error is invisible to
 * them. This suite runs the real query against `erp_test` Postgres.
 */
describe('Goods doc "Đối tượng" filter — real Postgres (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let storageId: string;
  let locationId: string;

  // Two distinct employee counterparties so a party filter can prove it
  // returns the matching document and excludes the other one, not just 200.
  let employeeAId: string;
  let employeeBId: string;
  const EMPLOYEE_A_FIRST = 'Thanh';
  const EMPLOYEE_A_LAST = 'Vuong';
  const EMPLOYEE_B_FIRST = 'Bao';
  const EMPLOYEE_B_LAST = 'Ngo';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

    await grantExtraPermissions();
    await seedLocation();
    await seedEmployees();
  }, 300_000);

  afterAll(async () => {
    await app?.close();
  });

  function headers() {
    return {
      Authorization: authHeader(seed.accessToken),
      'X-Branch-Id': seed.branchId,
    };
  }

  /** `goods_receipt.read` isn't in seedBaseData's default permission set. */
  async function grantExtraPermissions(): Promise<void> {
    const roleId = 'd0000000-0000-4000-8000-000000000001';
    for (const perm of ['goods_receipt.read']) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'inventory')
         ON CONFLICT DO NOTHING`,
        [perm],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, perm],
      );
    }
    // The permission set is Redis-cached per (userId, orgId); the seeded
    // user/org ids are fixed across every E2E file, so a grant here is
    // invisible until the stale cache entry (possibly warmed by an earlier
    // suite) is dropped.
    await app
      .get(RbacService)
      .invalidateUserPermissions(seed.userId, seed.organizationId);
  }

  async function seedLocation(): Promise<void> {
    storageId = 'f0000000-0000-4000-8000-000000000001';
    locationId = 'f0000000-0000-4000-8000-000000000002';
    await ds.query(
      `INSERT INTO storages (id, organization_id, branch_id, name, is_main_storage, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, 'Kho chính', true, $4::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [storageId, seed.organizationId, seed.branchId, seed.userId],
    );
    await ds.query(
      `INSERT INTO locations
         (id, organization_id, branch_id, storage_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, 'A-01', 'Kệ A-01', 'SHELF', true, $5::uuid, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [locationId, seed.organizationId, seed.branchId, storageId, seed.userId],
    );
  }

  /** Two employee users in the seeded org — the `employee` CASE arm reads `users`. */
  async function seedEmployees(): Promise<void> {
    employeeAId = 'f0000000-0000-4000-8000-0000000000a1';
    employeeBId = 'f0000000-0000-4000-8000-0000000000a2';
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES
         ($1::uuid, $3::uuid, 'party-a@test.com', 'x', $4, $5, true, NOW(), NOW()),
         ($2::uuid, $3::uuid, 'party-b@test.com', 'x', $6, $7, true, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        employeeAId,
        employeeBId,
        seed.organizationId,
        EMPLOYEE_A_FIRST,
        EMPLOYEE_A_LAST,
        EMPLOYEE_B_FIRST,
        EMPLOYEE_B_LAST,
      ],
    );
  }

  // ── Nhập kho — POST /v2/goods-receipts/search ─────────────────────────

  describe('POST /v2/goods-receipts/search', () => {
    let receiptAId: string;
    let receiptBId: string;

    beforeAll(async () => {
      receiptAId = 'f0000000-0000-4000-8000-0000000000b1';
      receiptBId = 'f0000000-0000-4000-8000-0000000000b2';
      await ds.query(
        `INSERT INTO goods_receipts
           (id, organization_id, branch_id, document_number, status, purpose,
            counterparty_kind, counterparty_id, received_at, location_id, created_by, created_at, updated_at)
         VALUES
           ($1::uuid, $3::uuid, $4::uuid, 'PNK-PARTY-A', 'POSTED', 'OTHER', 'employee', $5::uuid, NOW(), $6::uuid, $7::uuid, NOW(), NOW()),
           ($2::uuid, $3::uuid, $4::uuid, 'PNK-PARTY-B', 'POSTED', 'OTHER', 'employee', $8::uuid, NOW(), $6::uuid, $7::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          receiptAId,
          receiptBId,
          seed.organizationId,
          seed.branchId,
          employeeAId,
          locationId,
          seed.userId,
          employeeBId,
        ],
      );
    });

    function search(body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post('/v2/goods-receipts/search')
        .set(headers())
        .send(body);
    }

    it('does not 500 when filtering "Đối tượng" against an employee-kind counterparty', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      });
      expect(res.status).toBe(201);
    });

    it('filters "Đối tượng" by employee name and returns only the matching receipt', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      }).expect(201);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(receiptAId);
      expect(ids).not.toContain(receiptBId);
    });
  });

  // ── Xuất kho — POST /v2/inventory/goods-issues/search ─────────────────

  describe('POST /v2/inventory/goods-issues/search', () => {
    let issueAId: string;
    let issueBId: string;

    beforeAll(async () => {
      issueAId = 'f0000000-0000-4000-8000-0000000000c1';
      issueBId = 'f0000000-0000-4000-8000-0000000000c2';
      await ds.query(
        `INSERT INTO goods_issues
           (id, organization_id, branch_id, document_number, location_id, reason, status, purpose,
            counterparty_kind, counterparty_id, created_by, created_at, updated_at)
         VALUES
           ($1::uuid, $3::uuid, $4::uuid, 'XK-PARTY-A', $5::uuid, 'Test', 'POSTED', 'OTHER', 'employee', $6::uuid, $7::uuid, NOW(), NOW()),
           ($2::uuid, $3::uuid, $4::uuid, 'XK-PARTY-B', $5::uuid, 'Test', 'POSTED', 'OTHER', 'employee', $8::uuid, $7::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          issueAId,
          issueBId,
          seed.organizationId,
          seed.branchId,
          locationId,
          employeeAId,
          seed.userId,
          employeeBId,
        ],
      );
    });

    function search(body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post('/v2/inventory/goods-issues/search')
        .set(headers())
        .send(body);
    }

    it('does not 500 when filtering "Đối tượng" against an employee-kind counterparty', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      });
      expect(res.status).toBe(201);
    });

    it('filters "Đối tượng" by employee name and returns only the matching issue', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      }).expect(201);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(issueAId);
      expect(ids).not.toContain(issueBId);
    });
  });

  // ── Chuyển kho — POST /v2/inventory/stock/transfers/search ────────────
  //
  // `party` here is `COALESCE(counterpartyNameSql('st'), TRANSPORTER_NAME_
  // SUBQUERY)` — both halves independently join `users` on organizationId
  // with no cast, so this single filter exercises both broken expressions.

  describe('POST /v2/inventory/stock/transfers/search', () => {
    let transferAId: string;
    let transferBId: string;
    let transferTransporterId: string;

    beforeAll(async () => {
      transferAId = 'f0000000-0000-4000-8000-0000000000d1';
      transferBId = 'f0000000-0000-4000-8000-0000000000d2';
      transferTransporterId = 'f0000000-0000-4000-8000-0000000000d3';
      await ds.query(
        `INSERT INTO stock_transfers
           (id, organization_id, branch_id, document_number, status, source_branch_id, destination_branch_id,
            counterparty_kind, counterparty_id, created_by, created_at, updated_at)
         VALUES
           ($1::uuid, $3::uuid, $4::uuid, 'LDC-PARTY-A', 'DRAFT', $4::uuid, $4::uuid, 'employee', $5::uuid, $6::uuid, NOW(), NOW()),
           ($2::uuid, $3::uuid, $4::uuid, 'LDC-PARTY-B', 'DRAFT', $4::uuid, $4::uuid, 'employee', $7::uuid, $6::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          transferAId,
          transferBId,
          seed.organizationId,
          seed.branchId,
          employeeAId,
          seed.userId,
          employeeBId,
        ],
      );
      // A legacy transfer with no counterparty, only a transporter — covers
      // the TRANSPORTER_NAME_SUBQUERY fallback half of the COALESCE.
      await ds.query(
        `INSERT INTO stock_transfers
           (id, organization_id, branch_id, document_number, status, source_branch_id, destination_branch_id,
            transporter_user_id, created_by, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, $3::uuid, 'LDC-TRANSPORT-A', 'DRAFT', $3::uuid, $3::uuid, $4::uuid, $5::uuid, NOW(), NOW())
         ON CONFLICT (id) DO NOTHING`,
        [
          transferTransporterId,
          seed.organizationId,
          seed.branchId,
          employeeAId,
          seed.userId,
        ],
      );
    });

    function search(body: Record<string, unknown>) {
      return request(app.getHttpServer())
        .post('/v2/inventory/stock/transfers/search')
        .set(headers())
        .send(body);
    }

    it('does not 500 when filtering "Đối tượng" against an employee-kind counterparty', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      });
      expect(res.status).toBe(201);
    });

    it('filters "Đối tượng" by employee name — matches counterparty AND the legacy transporter fallback, excludes the other employee', async () => {
      const res = await search({
        party: { operator: '*', value: EMPLOYEE_A_FIRST },
      }).expect(201);
      const ids = res.body.data.map((r: { id: string }) => r.id);
      expect(ids).toContain(transferAId);
      expect(ids).toContain(transferTransporterId);
      expect(ids).not.toContain(transferBId);
    });
  });
});
