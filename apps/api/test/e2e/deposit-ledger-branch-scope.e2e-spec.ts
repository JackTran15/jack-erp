import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
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
 * TKT-DEP-01/DEP-07 — `GET /deposit-ledger` scoped to every ACTIVE deposit
 * account of a branch when `depositAccountId` is omitted (BR-LEDG-04), instead
 * of requiring exactly one. Exercises the real UNION ALL / `= ANY($1)` /
 * derived-table ORDER BY against Postgres — the leg-splitting arithmetic
 * itself is already exhaustively unit-tested (mocked) in
 * `deposit-ledger.service.spec.ts`; this proves the real SQL actually runs.
 *
 * Branch A gets two deposit funds (fund1, fund2) with distinct opening
 * balances. Movements are inserted directly into `deposit_movements` (same
 * pattern this suite already uses for `deposit_accounts` fixtures) rather than
 * driven through a real checkout, since the interesting case — a same-branch
 * TRANSFER between two deposit funds — has no product-facing endpoint today
 * (GĐ4 inter-branch transfer instead posts two independent
 * WITHDRAWAL/DEPOSIT movements). `GET /deposit-ledger` itself is always the
 * real HTTP endpoint under test.
 */
describe('Deposit ledger — branch scope (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  let branchBId: string;
  let fund1Id: string; // branch A, opening 1,000,000
  let fund2Id: string; // branch A, opening 500,000
  let fundBId: string; // branch B, opening 0

  const DATE_FROM = '2026-01-01';
  const DATE_TO = '2026-01-31';

  const headersFor = (branchId: string) => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': branchId,
  });

  const getLedger = (branchId: string, query: Record<string, unknown>) =>
    request(app.getHttpServer())
      .get('/deposit-ledger')
      .set(headersFor(branchId))
      .query({ dateFrom: DATE_FROM, dateTo: DATE_TO, ...query });

  const insertDepositAccount = async (opts: {
    branchId: string;
    code: string;
    accountId: string;
    openingBalance: number;
    balance: number;
  }): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BANK_ACCOUNT', $9, $10, '2025-12-31', $11,
               false, false, 'ACTIVE', $12, NOW(), NOW())`,
      [
        id,
        seed.organizationId,
        opts.branchId,
        `Deposit ${opts.code}`,
        opts.code,
        `ACC-${opts.code}`,
        'ERP Test',
        opts.accountId,
        opts.accountId,
        opts.openingBalance,
        opts.balance,
        seed.userId,
      ],
    );
    return id;
  };

  const insertMovement = async (opts: {
    branchId: string;
    depositAccountId: string;
    toAccountId?: string;
    type: 'DEPOSIT' | 'TRANSFER';
    amount: number;
    docDate: string;
  }): Promise<void> => {
    await ds.query(
      `INSERT INTO deposit_movements
         (id, organization_id, branch_id, deposit_account_id, to_account_id, type,
          amount, net_amount, doc_date, recon_status, source, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $6, $7, 'CHUA', 'MANUAL', $8, NOW(), NOW())`,
      [
        seed.organizationId,
        opts.branchId,
        opts.depositAccountId,
        opts.toAccountId ?? null,
        opts.type,
        opts.amount,
        opts.docDate,
        seed.userId,
      ],
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    branchAId = seed.branchId;

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    await ds.query(
      `INSERT INTO permissions (id, key, description, module)
       VALUES (gen_random_uuid(), 'accounting.deposit_ledger.read', 'accounting.deposit_ledger.read', 'accounting')
       ON CONFLICT DO NOTHING`,
    );
    await ds.query(
      `INSERT INTO role_permissions (id, role_id, permission_id)
       SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p
       WHERE p.key = 'accounting.deposit_ledger.read'
       ON CONFLICT DO NOTHING`,
      [roleId],
    );

    // Second branch + branch access, then re-login so the JWT's branchIds picks it up.
    branchBId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch B', 'ACTIVE', false, $3, NOW(), NOW())`,
      [branchBId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
      [seed.userId, branchBId, seed.organizationId],
    );
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: seed.organizationId })
      .expect(200);
    seed = { ...seed, accessToken: loginRes.body.accessToken };

    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1122', 'Tiền gửi ngân hàng (test)', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    const [{ id: coaId }] = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = '1122'`,
      [seed.organizationId],
    );

    fund1Id = await insertDepositAccount({
      branchId: branchAId,
      code: 'FUND1',
      accountId: coaId,
      openingBalance: 1_000_000,
      balance: 1_250_000, // 1,000,000 + 750,000 deposit - 200,000 internal-out - 300,000 cross-branch-out
    });
    fund2Id = await insertDepositAccount({
      branchId: branchAId,
      code: 'FUND2',
      accountId: coaId,
      openingBalance: 500_000,
      balance: 700_000, // 500,000 + 200,000 internal-in
    });
    fundBId = await insertDepositAccount({
      branchId: branchBId,
      code: 'FUNDB',
      accountId: coaId,
      openingBalance: 0,
      balance: 0,
    });

    // 1) Plain deposit on fund1.
    await insertMovement({
      branchId: branchAId,
      depositAccountId: fund1Id,
      type: 'DEPOSIT',
      amount: 750_000,
      docDate: '2026-01-05',
    });
    // 2) Internal transfer fund1 -> fund2, both in branch A's scope -> must render as 2 rows.
    await insertMovement({
      branchId: branchAId,
      depositAccountId: fund1Id,
      toAccountId: fund2Id,
      type: 'TRANSFER',
      amount: 200_000,
      docDate: '2026-01-10',
    });
    // 3) Transfer fund1 -> fundB (branch B) — only fund1's leg is in branch A's scope -> 1 row.
    await insertMovement({
      branchId: branchAId,
      depositAccountId: fund1Id,
      toAccountId: fundBId,
      type: 'TRANSFER',
      amount: 300_000,
      docDate: '2026-01-15',
    });
  }, 240000);

  afterAll(async () => {
    await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 15000))]);
  }, 60000);

  it('omitting depositAccountId returns every movement of the branch, scoped away from other branches', async () => {
    const res = await getLedger(branchAId, {}).expect(200);
    expect(res.body.total).toBe(4); // DEPOSIT + transfer(2 legs) + cross-branch-out(1 leg)
    expect(res.body.openingBalance).toBe('1500000'); // 1,000,000 + 500,000
    expect(res.body.closingBalance).toBe('1950000'); // matches SUM(deposit_accounts.balance) below
    const accountNos = res.body.rows.map((r: { depositAccountNo: string }) => r.depositAccountNo);
    expect(accountNos).toEqual(expect.arrayContaining(['ACC-FUND1', 'ACC-FUND2']));
    expect(accountNos).not.toContain('ACC-FUNDB');
  });

  it('closing balance in "all accounts" mode matches the sum of the branch funds\' real balances', async () => {
    const res = await getLedger(branchAId, {}).expect(200);
    const [{ sum }] = await ds.query(
      `SELECT SUM(balance)::text AS sum FROM deposit_accounts WHERE branch_id = $1`,
      [branchAId],
    );
    expect(Number(res.body.closingBalance)).toBe(Number(sum));
  });

  it('an internal transfer between two in-scope funds renders as two rows that net to zero', async () => {
    const res = await getLedger(branchAId, {}).expect(200);
    const transferRows = res.body.rows.filter(
      (r: { documentNumber: string | null; amountIn: string; amountOut: string }) =>
        r.amountIn === '200000' || r.amountOut === '200000',
    );
    expect(transferRows).toHaveLength(2);
    const netEffect = transferRows.reduce(
      (sum: number, r: { amountIn: string; amountOut: string }) =>
        sum + Number(r.amountIn) - Number(r.amountOut),
      0,
    );
    expect(netEffect).toBe(0);
  });

  it('a transfer with only one leg in scope (cross-branch) renders as a single row', async () => {
    const res = await getLedger(branchAId, {}).expect(200);
    const crossBranchRows = res.body.rows.filter(
      (r: { amountOut: string }) => r.amountOut === '300000',
    );
    expect(crossBranchRows).toHaveLength(1);
    expect(crossBranchRows[0].depositAccountNo).toBe('ACC-FUND1');
  });

  it('regression: an explicit depositAccountId still scopes to exactly that one fund (BR-LEDG-03)', async () => {
    const res = await getLedger(branchAId, { depositAccountId: fund1Id }).expect(200);
    expect(res.body.total).toBe(3); // deposit + internal-out + cross-branch-out (not fund2's leg)
    expect(res.body.openingBalance).toBe('1000000');
    expect(res.body.closingBalance).toBe('1250000');
    expect(
      res.body.rows.every((r: { depositAccountNo: string }) => r.depositAccountNo === 'ACC-FUND1'),
    ).toBe(true);
  });

  it('an unknown/other-branch depositAccountId is rejected with 404', async () => {
    await getLedger(branchAId, { depositAccountId: fundBId }).expect(404);
  });

  it('a branch with no deposit accounts returns an empty ledger, not an error', async () => {
    const emptyBranchId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Empty Branch', 'ACTIVE', false, $3, NOW(), NOW())`,
      [emptyBranchId, seed.organizationId, seed.userId],
    );
    await ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
      [seed.userId, emptyBranchId, seed.organizationId],
    );
    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'password123', organizationId: seed.organizationId })
      .expect(200);
    const freshToken = loginRes.body.accessToken;

    const res = await request(app.getHttpServer())
      .get('/deposit-ledger')
      .set({ Authorization: authHeader(freshToken), 'X-Branch-Id': emptyBranchId })
      .query({ dateFrom: DATE_FROM, dateTo: DATE_TO })
      .expect(200);

    expect(res.body).toEqual(
      expect.objectContaining({ openingBalance: '0', rows: [], total: 0, closingBalance: '0' }),
    );
  });

  it('pagination: the running balance at the top of page 2 continues from the bottom of page 1', async () => {
    const page1 = await getLedger(branchAId, { page: 1, pageSize: 2 }).expect(200);
    const page2 = await getLedger(branchAId, { page: 2, pageSize: 2 }).expect(200);
    expect(page1.body.rows).toHaveLength(2);
    expect(page2.body.rows).toHaveLength(2);

    const lastOfPage1 = Number(page1.body.rows[1].runningBalance);
    const firstRowOfPage2 = page2.body.rows[0];
    const expectedAfterFirstRowOfPage2 =
      lastOfPage1 + Number(firstRowOfPage2.amountIn) - Number(firstRowOfPage2.amountOut);
    expect(Number(firstRowOfPage2.runningBalance)).toBe(expectedAfterFirstRowOfPage2);

    // Last row of the last page always reconciles to the overall closing balance.
    const full = await getLedger(branchAId, {}).expect(200);
    expect(Number(page2.body.rows[1].runningBalance)).toBe(Number(full.body.closingBalance));
  });
});
