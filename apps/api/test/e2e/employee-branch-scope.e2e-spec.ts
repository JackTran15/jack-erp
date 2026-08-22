import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import {
  createTestApp,
  resetDatabase,
  seedBaseData,
  authHeader,
  request,
  SeedResult,
} from './setup/test-app';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * T-04-01 — every employee picker narrows to the active branch.
 *
 * Four endpoints reach employees through three different query mechanisms
 * (TypeORM QueryBuilder, raw SQL UNION, find→QueryBuilder). The unit tests
 * prove each one is handed the right scope; only this suite proves the scope
 * actually changes which rows Postgres returns.
 *
 * Fixture: two branches, four accounts.
 *   userAB   — both branches, holds iam.user.read.all  → mode "all"
 *   userA    — branch A only                            → mode "branch"
 *   userB    — branch B only                            → the row that must disappear
 *   userNone — no branch assignment at all              → mode "none"
 *
 * Single-branch accounts are deliberate: login pins the JWT to branchIds[0] and
 * ActorContext reads the JWT ahead of X-Branch-Id, so a one-branch account is
 * the only way to assert a specific branch without going through switch-branch.
 */
describe('Employee pickers — active-branch scope (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  let branchBId: string;

  const users: Record<string, { id: string; email: string; token: string }> = {};

  const PASSWORD = 'password123';

  async function createUser(opts: {
    key: string;
    email: string;
    firstName: string;
    lastName: string;
    branches: string[];
    roleId: string;
  }): Promise<void> {
    const id = randomUUID();
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, NOW(), NOW())`,
      [id, seed.organizationId, opts.email, passwordHash, opts.firstName, opts.lastName],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id)
       VALUES (gen_random_uuid(), $1, $2, $3)`,
      [id, opts.roleId, seed.organizationId],
    );
    for (const branchId of opts.branches) {
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
        [id, branchId, seed.organizationId],
      );
    }
    // An employee profile so the salesperson filter has a row to return, and so
    // the pickers can match on employee code.
    await ds.query(
      `INSERT INTO employee_profiles (id, organization_id, user_id, code, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, NOW(), NOW())`,
      [seed.organizationId, id, `NV-${opts.key}`, seed.userId],
    );

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: opts.email, password: PASSWORD, organizationId: seed.organizationId })
      .expect(200);

    users[opts.key] = { id, email: opts.email, token: res.body.accessToken };
  }

  async function grantPermission(roleId: string, key: string): Promise<void> {
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), $1, $1, $2) ON CONFLICT DO NOTHING`,
      [key, key.split('.')[0]],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
       ON CONFLICT DO NOTHING`,
      [roleId, key],
    );
  }

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    branchAId = seed.branchId;

    branchBId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch B', 'ACTIVE', false, $3, NOW(), NOW())`,
      [branchBId, seed.organizationId, seed.userId],
    );

    const [{ id: baseRoleId }] = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    // Not seeded by seedBaseData; the cash-voucher party picker is gated on it.
    await grantPermission(baseRoleId, 'accounting.cash_voucher_partner.read');

    // A second role identical to the first plus the org-wide read bypass, so
    // "all" mode differs from "branch" mode by exactly one permission.
    const allRoleId = randomUUID();
    await ds.query(
      `INSERT INTO roles (id, organization_id, name, description, created_at, updated_at)
       VALUES ($1, $2, 'admin-read-all', 'admin + iam.user.read.all', NOW(), NOW())`,
      [allRoleId, seed.organizationId],
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, rp.permission_id
       FROM role_permissions rp WHERE rp.role_id = $2::uuid
       ON CONFLICT DO NOTHING`,
      [allRoleId, baseRoleId],
    );
    await grantPermission(allRoleId, 'iam.user.read.all');

    await createUser({
      key: 'AB', email: 'both@test.com', firstName: 'Nhân viên', lastName: 'Cả hai',
      branches: [branchAId, branchBId], roleId: allRoleId,
    });
    await createUser({
      key: 'A', email: 'a@test.com', firstName: 'Nhân viên', lastName: 'Chi nhánh A',
      branches: [branchAId], roleId: baseRoleId,
    });
    await createUser({
      key: 'B', email: 'b@test.com', firstName: 'Nhân viên', lastName: 'Chi nhánh B',
      branches: [branchBId], roleId: baseRoleId,
    });
    await createUser({
      key: 'None', email: 'none@test.com', firstName: 'Nhân viên', lastName: 'Chưa gán',
      branches: [], roleId: baseRoleId,
    });

    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);
  }, 600_000);

  afterAll(async () => {
    await app?.close();
  });

  // ── The four endpoints, each reduced to "which user ids came back" ──────────

  const server = () => app.getHttpServer();

  const counterparties = (token: string) =>
    request(server())
      .post('/v2/counterparties/search')
      .set({ Authorization: authHeader(token), 'X-Branch-Id': branchAId })
      .send({ type: 'employee', page: 1, pageSize: 50 });

  const cashPartners = (token: string) =>
    request(server())
      .get('/cash-vouchers/partners')
      .set({ Authorization: authHeader(token), 'X-Branch-Id': branchAId })
      .query({ type: 'employee', page: 1, pageSize: 50 });

  const filterOptions = (token: string, type: 'cashier' | 'salesperson') =>
    request(server())
      .get('/reports/invoices/filter-options')
      .set({ Authorization: authHeader(token), 'X-Branch-Id': branchAId })
      .query({ type, pageSize: 50 });

  /** Ids from a `{ data: [...] }` payload. */
  const dataIds = (body: { data: Array<{ id: string }> }) =>
    body.data.map((r) => r.id);

  /** Ids from an IDropdownOption[] payload. */
  const optionIds = (body: Array<{ value: string }>) => body.map((o) => o.value);

  /** The salesperson filter returns employee_profiles ids, not user ids. */
  const profileIdOf = async (userId: string): Promise<string> => {
    const [row] = await ds.query(
      `SELECT id FROM employee_profiles WHERE user_id = $1`,
      [userId],
    );
    return row.id as string;
  };

  describe('mode "branch" — an account assigned to one branch', () => {
    // AC-01 / AC-05 / AC-08 — assertions are by identity, never by row count: a
    // count can be right for the wrong reason.
    it('counterparty search omits the other branch', async () => {
      const res = await counterparties(users.A.token).expect(201);
      expect(dataIds(res.body)).toContain(users.A.id);
      expect(dataIds(res.body)).not.toContain(users.B.id);
    });

    it('cash-voucher party lookup omits the other branch', async () => {
      const res = await cashPartners(users.A.token).expect(200);
      expect(dataIds(res.body)).toContain(users.A.id);
      expect(dataIds(res.body)).not.toContain(users.B.id);
    });

    it('cashier filter omits the other branch', async () => {
      const res = await filterOptions(users.A.token, 'cashier').expect(200);
      expect(optionIds(res.body)).toContain(users.A.id);
      expect(optionIds(res.body)).not.toContain(users.B.id);
    });

    // AC-09 — this one returns employee_profiles ids, so map back through the
    // profile to prove the right person was excluded.
    it('salesperson filter omits the other branch', async () => {
      const res = await filterOptions(users.A.token, 'salesperson').expect(200);
      const profileIds = optionIds(res.body);

      expect(profileIds).toContain(await profileIdOf(users.A.id));
      expect(profileIds).not.toContain(await profileIdOf(users.B.id));
    });

    // AC-04 — the account with no assignment row is invisible everywhere, which
    // is the branch of A-02 that erp_dev has no live data for.
    it('hides the account that belongs to no branch at all', async () => {
      const cp = await counterparties(users.A.token).expect(201);
      const cash = await cashPartners(users.A.token).expect(200);
      const cashier = await filterOptions(users.A.token, 'cashier').expect(200);

      expect(dataIds(cp.body)).not.toContain(users.None.id);
      expect(dataIds(cash.body)).not.toContain(users.None.id);
      expect(optionIds(cashier.body)).not.toContain(users.None.id);
    });
  });

  describe('mode "all" — iam.user.read.all', () => {
    // AC-10 — the bypass still sees the other branch, so "lập phiếu hộ chi
    // nhánh khác" keeps working.
    it('sees every branch on all four endpoints', async () => {
      const cp = await counterparties(users.AB.token).expect(201);
      const cash = await cashPartners(users.AB.token).expect(200);
      const cashier = await filterOptions(users.AB.token, 'cashier').expect(200);
      const sales = await filterOptions(users.AB.token, 'salesperson').expect(200);

      expect(dataIds(cp.body)).toContain(users.B.id);
      expect(dataIds(cash.body)).toContain(users.B.id);
      expect(optionIds(cashier.body)).toContain(users.B.id);

      expect(optionIds(sales.body)).toContain(await profileIdOf(users.B.id));
    });

    it('sees the unassigned account too', async () => {
      const cp = await counterparties(users.AB.token).expect(201);
      expect(dataIds(cp.body)).toContain(users.None.id);
    });
  });

  describe('mode "none" — an account with no branch assignment', () => {
    // AC-12 — fail closed. What must never happen is the whole organization
    // coming back.
    it('counterparty search returns an empty list, not the organization', async () => {
      const res = await request(server())
        .post('/v2/counterparties/search')
        .set({ Authorization: authHeader(users.None.token) })
        .send({ type: 'employee', page: 1, pageSize: 50 })
        .expect(201);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it('cashier and salesperson filters return empty lists', async () => {
      for (const type of ['cashier', 'salesperson'] as const) {
        const res = await request(server())
          .get('/reports/invoices/filter-options')
          .set({ Authorization: authHeader(users.None.token) })
          .query({ type, pageSize: 50 })
          .expect(200);
        expect(res.body).toEqual([]);
      }
    });

    /**
     * The cash-voucher lookup is the exception, and not because of this feature:
     * its controller carries `@RequireBranchScope()`, and BranchScopeGuard
     * rejects an account with no assignments before the handler runs. The
     * `mode: 'none'` arm in PartnerLookupService is therefore unreachable over
     * HTTP — kept as defence in depth, exercised only by its unit test.
     *
     * Recorded here rather than in a comment somewhere, because a 403 that
     * nobody wrote down looks like a regression the next time someone reads it.
     */
    it('cash-voucher party lookup is refused by the branch-scope guard, not by us', async () => {
      await request(server())
        .get('/cash-vouchers/partners')
        .set({ Authorization: authHeader(users.None.token) })
        .query({ type: 'employee', page: 1, pageSize: 50 })
        .expect(403);
    });
  });
});
