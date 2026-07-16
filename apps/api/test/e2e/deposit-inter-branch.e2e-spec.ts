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
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * Deposit Fund Inter-Branch Transfer (EPIC-15072026, GĐ4) UAT-07 gate.
 *
 * The transfer flow is synchronous (create/confirm/cancel are plain HTTP calls,
 * no Kafka round-trip involved — unlike the POS auto-post path in GĐ1/GĐ3), so
 * this suite runs fast and deterministically.
 *
 * Two separate logged-in users are used (not one user with a switched
 * X-Branch-Id header) because ActorContext.branchId resolution prioritizes the
 * JWT-baked claim set at login over the header — the only way to reliably act
 * as "branch A" then "branch B" is two real logins, each scoped to exactly one
 * branch's assignment.
 */
describe('Deposit Fund Inter-Branch Transfer (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  let branchBId: string;
  let branchCId: string; // uninvolved third branch, for the BR-PERM-01 visibility check

  let tokenA: string; // assigned to branch A only
  let tokenB: string; // assigned to branch B only
  let tokenC: string; // assigned to branch C only (uninvolved)
  let tokenOrg: string; // assigned to BOTH branch A and B — sees the true grand-total invariant

  let coaBankId: string; // COA 1121
  let bankId: string;

  const headersFor = (token: string, branchId: string) => ({
    Authorization: authHeader(token),
    'X-Branch-Id': branchId,
  });

  const accountByCode = async (code: string): Promise<string> => {
    const rows = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [seed.organizationId, code],
    );
    return rows[0].id;
  };

  const depositBalance = async (accountId: string): Promise<number> => {
    const rows = await ds.query(`SELECT balance FROM deposit_accounts WHERE id = $1`, [accountId]);
    return Number(rows[0].balance);
  };

  /**
   * A fresh user assigned to exactly the given branch(es), then logged in once
   * all assignments exist. Branch-scoped actors (branchIds: [one branch]) are
   * needed because ActorContext.branchId resolution prioritizes the JWT-baked
   * claim set at login over the X-Branch-Id header — reusing one token across
   * branches by switching the header alone does not work. A multi-branch actor
   * (branchIds: [A, B]) is needed to observe the TRUE grand-total invariant
   * across the A→B boundary — a single-branch actor's own dashboard total
   * necessarily drops once funds leave its one visible branch, which is
   * correct branch-scoped behavior but not what R5's invariant is about.
   */
  const createBranchUser = async (opts: {
    email: string;
    branchIds: string[];
    roleId: string;
  }): Promise<string> => {
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash('password123', 10);
    await ds.query(
      `INSERT INTO users (id, organization_id, email, password_hash, first_name, last_name, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'E2E', 'User', true, NOW(), NOW())`,
      [userId, seed.organizationId, opts.email, passwordHash],
    );
    await ds.query(
      `INSERT INTO user_roles (id, user_id, role_id, organization_id) VALUES (gen_random_uuid(), $1, $2, $3)`,
      [userId, opts.roleId, seed.organizationId],
    );
    for (const branchId of opts.branchIds) {
      await ds.query(
        `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
         VALUES (gen_random_uuid(), $1, $2, $3, $1)`,
        [userId, branchId, seed.organizationId],
      );
    }
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: opts.email, password: 'password123', organizationId: seed.organizationId })
      .expect(200);
    return res.body.accessToken;
  };

  const seedDepositAccount = async (opts: {
    branchId: string;
    code: string;
    balance: number;
  }): Promise<string> => {
    const id = randomUUID();
    // create() always resolves the CALLER's branch default account for leg A
    // (no explicit fromAccountId override) — at most one is_default=true row
    // per branch can exist, or resolution becomes nondeterministic. Each test
    // scenario seeds its own "current" default for branch A.
    await ds.query(
      `UPDATE deposit_accounts SET is_default = false WHERE branch_id = $1 AND is_default = true`,
      [opts.branchId],
    );
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BANK_ACCOUNT', $9, 0, '2026-01-01', $10,
               false, true, 'ACTIVE', $11, NOW(), NOW())`,
      [
        id,
        seed.organizationId,
        opts.branchId,
        `Deposit ${opts.code}`,
        opts.code,
        `ACC-${opts.code}`,
        'ERP Test',
        bankId,
        coaBankId,
        opts.balance,
        seed.userId,
      ],
    );
    // R2 (TKT-DFR-04): the WITHDRAWAL available-balance guard sums deposit_movements,
    // not deposit_accounts.balance — back a non-zero balance with a real movement row.
    if (opts.balance > 0) {
      await ds.query(
        `INSERT INTO deposit_movements
           (id, organization_id, branch_id, deposit_account_id, type, amount,
            fee_amount, net_amount, doc_date, recon_status, source, created_by,
            created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'DEPOSIT', $4, 0, $4, '2026-01-01',
                 'CHUA', 'MANUAL', $5, NOW(), NOW())`,
        [seed.organizationId, opts.branchId, id, opts.balance, seed.userId],
      );
    }
    return id;
  };

  const dashboard = async (token: string, branchId: string): Promise<any> => {
    const res = await request(app.getHttpServer())
      .get('/deposit/dashboard')
      .set(headersFor(token, branchId))
      .expect(200);
    return res.body;
  };

  const inTransit = async (token: string, branchId: string): Promise<any> => {
    const res = await request(app.getHttpServer())
      .get('/deposit-transfers/in-transit')
      .set(headersFor(token, branchId))
      .expect(200);
    return res.body;
  };

  /** No revenue/expense/other line (5xx/6xx/7xx/8xx) on either leg's JE — BR-TRF-05. */
  const assertJournalNoPnl = async (bankPaymentId: string): Promise<void> => {
    const rows = await ds.query(
      `SELECT a.code FROM journal_lines jl
         JOIN accounts a ON a.id = jl.account_id
         JOIN bank_payments bp ON bp.journal_entry_id = jl.journal_entry_id
        WHERE bp.id = $1`,
      [bankPaymentId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(['5', '6', '7', '8']).not.toContain(String(row.code)[0]);
    }
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    branchAId = seed.branchId;

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.deposit_transfer.create',
      'accounting.deposit_transfer.confirm',
      'accounting.deposit_transfer.cancel',
      'accounting.deposit_transfer.read',
      'accounting.deposit_dashboard.read',
    ];
    for (const key of perms) {
      await ds.query(
        `INSERT INTO permissions (id, key, description, module)
         VALUES (gen_random_uuid(), $1, $1, 'accounting') ON CONFLICT DO NOTHING`,
        [key],
      );
      await ds.query(
        `INSERT INTO role_permissions (id, role_id, permission_id)
         SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
         ON CONFLICT DO NOTHING`,
        [roleId, key],
      );
    }

    await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);

    branchBId = randomUUID();
    branchCId = randomUUID();
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $3, 'Branch B', 'ACTIVE', false, $2, NOW(), NOW()),
              ($4, $3, 'Branch C', 'ACTIVE', false, $2, NOW(), NOW())`,
      [branchBId, seed.userId, seed.organizationId, branchCId],
    );

    tokenA = seed.accessToken;
    tokenB = await createBranchUser({ email: 'branch-b@test.com', branchIds: [branchBId], roleId });
    tokenC = await createBranchUser({ email: 'branch-c@test.com', branchIds: [branchCId], roleId });
    tokenOrg = await createBranchUser({
      email: 'branch-org@test.com',
      branchIds: [branchAId, branchBId],
      roleId,
    });

    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    coaBankId = await accountByCode('1121');

    bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );
  }, 120000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('UAT-07 — happy path across 3 checkpoints (create / mid-transit / confirm)', () => {
    it('A -10tr, B unchanged, in-transit=10tr, invariant grand total; then B +10tr, in-transit clears, still invariant', async () => {
      const depositA = await seedDepositAccount({ branchId: branchAId, code: 'IB-A1', balance: 50_000_000 });
      const depositB = await seedDepositAccount({ branchId: branchBId, code: 'IB-B1', balance: 0 });

      // tokenOrg (assigned to BOTH branches) is the observer for grand-total
      // invariant checks — a single-branch actor's own view legitimately drops
      // once funds leave its one visible branch (see createBranchUser's doc).
      const before = await dashboard(tokenOrg, branchAId);

      const createRes = await request(app.getHttpServer())
        .post('/deposit-transfers')
        .set(headersFor(tokenA, branchAId))
        .send({ toBranchId: branchBId, toAccountId: depositB, amount: 10_000_000 })
        .expect(201);
      const transfer = createRes.body;
      expect(transfer.status).toBe('DANG_CHUYEN');

      // BR-TRF-01: A debited immediately, B untouched.
      expect(await depositBalance(depositA)).toBe(50_000_000 - 10_000_000);
      expect(await depositBalance(depositB)).toBe(0);

      // BR-TRF-02 / R5: the in-transit report carries the full amount.
      const midTransit = await inTransit(tokenA, branchAId);
      const midRow = midTransit.data.find((r: any) => r.id === transfer.id);
      expect(midRow).toBeDefined();
      expect(Number(midRow.amount)).toBe(10_000_000);

      // Grand total (accounts + in-transit) is unchanged mid-transfer.
      const mid = await dashboard(tokenOrg, branchAId);
      expect(mid.grandTotal).toBe(before.grandTotal);

      // BR-TRF-05: leg A's JE never touches a revenue/expense/other account.
      await assertJournalNoPnl(transfer.fromPaymentId);

      // Confirm at B.
      const confirmRes = await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/confirm`)
        .set(headersFor(tokenB, branchBId))
        .send({})
        .expect(201);
      expect(confirmRes.body.status).toBe('HOAN_TAT');
      expect(confirmRes.body.toReceiptId).toBeDefined();
      expect(confirmRes.body.confirmedBy).toBeDefined();
      expect(confirmRes.body.confirmedAt).toBeDefined();

      expect(await depositBalance(depositB)).toBe(10_000_000);

      const movementRows = await ds.query(
        `SELECT transfer_status FROM deposit_movements
          WHERE transfer_pair_id = $1 AND source_ref_line_id = 'OUT'`,
        [transfer.id],
      );
      expect(movementRows[0].transfer_status).toBe('HOAN_TAT');

      // In-transit clears once HOAN_TAT.
      const afterTransit = await inTransit(tokenA, branchAId);
      expect(afterTransit.data.find((r: any) => r.id === transfer.id)).toBeUndefined();

      // Grand total is STILL invariant after confirm.
      const after = await dashboard(tokenOrg, branchAId);
      expect(after.grandTotal).toBe(before.grandTotal);

      await assertJournalNoPnl(transfer.fromPaymentId);

      // BR-TRF-03: A can no longer cancel a completed transfer.
      await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/cancel`)
        .set(headersFor(tokenA, branchAId))
        .send({ reason: 'too late' })
        .expect(409);

      // BR-TRF-03: a second confirm is also rejected.
      await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/confirm`)
        .set(headersFor(tokenB, branchBId))
        .send({})
        .expect(409);
    }, 60000);
  });

  describe('BR-TRF-01 guard — insufficient balance blocks the transfer', () => {
    it('amount > available balance -> 400, no header row, no debit', async () => {
      const depositA = await seedDepositAccount({ branchId: branchAId, code: 'IB-A2', balance: 1_000_000 });
      const depositB = await seedDepositAccount({ branchId: branchBId, code: 'IB-B2', balance: 0 });

      const before = await depositBalance(depositA);

      const res = await request(app.getHttpServer())
        .post('/deposit-transfers')
        .set(headersFor(tokenA, branchAId))
        .send({ toBranchId: branchBId, toAccountId: depositB, amount: 5_000_000 })
        .expect(400);
      expect(res.body.message).toEqual(expect.stringContaining('Insufficient'));

      expect(await depositBalance(depositA)).toBe(before);
      const headerRows = await ds.query(
        `SELECT COUNT(*)::int AS c FROM deposit_transfer WHERE from_account_id = $1`,
        [depositA],
      );
      expect(headerRows[0].c).toBe(0);
    });
  });

  describe('cancel path', () => {
    it('cancel while DANG_CHUYEN restores A and clears the in-transit row', async () => {
      const depositA = await seedDepositAccount({ branchId: branchAId, code: 'IB-A3', balance: 20_000_000 });
      const depositB = await seedDepositAccount({ branchId: branchBId, code: 'IB-B3', balance: 0 });
      const before = await depositBalance(depositA);

      const createRes = await request(app.getHttpServer())
        .post('/deposit-transfers')
        .set(headersFor(tokenA, branchAId))
        .send({ toBranchId: branchBId, toAccountId: depositB, amount: 5_000_000 })
        .expect(201);
      const transfer = createRes.body;
      expect(await depositBalance(depositA)).toBe(before - 5_000_000);

      const cancelRes = await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/cancel`)
        .set(headersFor(tokenA, branchAId))
        .send({ reason: 'Nhập nhầm chi nhánh' })
        .expect(201);
      expect(cancelRes.body.status).toBe('DA_HUY');

      expect(await depositBalance(depositA)).toBe(before);
      const transitAfterCancel = await inTransit(tokenA, branchAId);
      expect(transitAfterCancel.data.find((r: any) => r.id === transfer.id)).toBeUndefined();
    });
  });

  describe('BR-PERM-01 — branch scoping', () => {
    it('a non-destination-branch actor cannot confirm (403); an uninvolved branch does not see the transfer', async () => {
      const depositA = await seedDepositAccount({ branchId: branchAId, code: 'IB-A4', balance: 10_000_000 });
      const depositB = await seedDepositAccount({ branchId: branchBId, code: 'IB-B4', balance: 0 });

      const createRes = await request(app.getHttpServer())
        .post('/deposit-transfers')
        .set(headersFor(tokenA, branchAId))
        .send({ toBranchId: branchBId, toAccountId: depositB, amount: 1_000_000 })
        .expect(201);
      const transfer = createRes.body;

      // Branch A itself is not the destination — confirm is forbidden.
      await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/confirm`)
        .set(headersFor(tokenA, branchAId))
        .send({})
        .expect(403);

      // Branch C is neither source nor destination — never sees this transfer.
      const cTransit = await inTransit(tokenC, branchCId);
      expect(cTransit.data.find((r: any) => r.id === transfer.id)).toBeUndefined();
    });
  });

  describe('Idempotency (D2)', () => {
    it('replaying confirm with the same X-Idempotency-Key posts exactly one leg-B movement', async () => {
      const depositA = await seedDepositAccount({ branchId: branchAId, code: 'IB-A5', balance: 10_000_000 });
      const depositB = await seedDepositAccount({ branchId: branchBId, code: 'IB-B5', balance: 0 });

      const createRes = await request(app.getHttpServer())
        .post('/deposit-transfers')
        .set(headersFor(tokenA, branchAId))
        .send({ toBranchId: branchBId, toAccountId: depositB, amount: 2_000_000 })
        .expect(201);
      const transfer = createRes.body;

      const idemKey = randomUUID();
      const r1 = await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/confirm`)
        .set({ ...headersFor(tokenB, branchBId), 'X-Idempotency-Key': idemKey })
        .send({})
        .expect(201);
      const r2 = await request(app.getHttpServer())
        .post(`/deposit-transfers/${transfer.id}/confirm`)
        .set({ ...headersFor(tokenB, branchBId), 'X-Idempotency-Key': idemKey })
        .send({})
        .expect(201);

      expect(r2.body.toReceiptId).toBe(r1.body.toReceiptId);
      expect(await depositBalance(depositB)).toBe(2_000_000);

      const movementCount = await ds.query(
        `SELECT COUNT(*)::int AS c FROM deposit_movements
          WHERE source = 'TRANSFER' AND source_ref_id = $1 AND source_ref_line_id = 'IN'`,
        [transfer.id],
      );
      expect(movementCount[0].c).toBe(1);
    });
  });
});
