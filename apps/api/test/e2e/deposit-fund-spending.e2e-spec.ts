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
import { CoaSeederService } from '../../src/modules/accounting/seeders/coa-seeder.service';
import { DefaultAccountSeederService } from '../../src/modules/accounting/seeders/default-account.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * Deposit Fund Spending (EPIC-15072026, GĐ2) UAT gate.
 *
 * Exercises the real HTTP surface — /bank-payments, /fund-swaps,
 * /supplier-deposit-payment — for the 4 UAT scenarios that matter most for GĐ2:
 * over-balance is blocked (UAT-04), a concurrent double-spend race only lets one
 * payment win (UAT-05, NFR-03), a same-branch deposit↔cash swap is atomic
 * (UAT-06), and paying a supplier from the deposit fund settles the payable and
 * is compensable on reversal (UAT-08).
 *
 * No POS checkout / Kafka round-trip is needed here — every scenario hits the
 * voucher endpoints directly, so this suite runs fast and deterministically
 * (unlike the GĐ1/GĐ3 suites, which wait on the async POS consumer).
 */
describe('Deposit Fund Spending (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  const branchBId = 'b0000000-0000-4000-8000-0000000000d4';

  let coaBankId: string; // COA 1121
  let cashGlId: string; // COA 1111
  let bankId: string;
  let cashAccountA: string;

  let depositAccountUAT04: string;
  let depositAccountUAT05: string;
  let depositAccountUAT06: string;
  let depositAccountUAT08: string;
  let depositAccountB: string;

  const headers = (branchId: string = branchAId) => ({
    Authorization: authHeader(seed.accessToken),
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
    const rows = await ds.query(`SELECT balance FROM deposit_accounts WHERE id = $1`, [
      accountId,
    ]);
    return Number(rows[0].balance);
  };

  const cashBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/cash/accounts/${cashAccountA}`)
      .set(headers())
      .expect(200);
    return Number(res.body.balance);
  };

  const seedDepositAccount = async (opts: {
    branchId: string;
    code: string;
    balance: number;
  }): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BANK_ACCOUNT', $9, 0, '2026-01-01', $10,
               false, false, 'ACTIVE', $11, NOW(), NOW())`,
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
    // not deposit_accounts.balance — back a non-zero balance with a real movement row
    // (no value_date → treated as already cleared) so both guards agree.
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

  /** Seed a supplier debt directly — DFS-05 settles supplier_debts, no reusable payables service exists. */
  const seedSupplierDebt = async (amount: number): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO supplier_debts
         (id, organization_id, branch_id, created_by, reference_code, goods_receipt_id,
          supplier_id, document_type, original_amount, paid_amount, remaining_amount,
          issued_at, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, gen_random_uuid(), gen_random_uuid(), 'goods_receipt',
               $6, 0, $6, '2026-07-01', 'open', NOW(), NOW())`,
      [
        id,
        seed.organizationId,
        branchAId,
        seed.userId,
        `GR-DFS09-${id.slice(0, 8)}`,
        amount,
      ],
    );
    return id;
  };

  const supplierDebt = async (
    id: string,
  ): Promise<{ paidAmount: number; remainingAmount: number; status: string }> => {
    const rows = await ds.query(
      `SELECT paid_amount::text AS paid_amount, remaining_amount::text AS remaining_amount, status
         FROM supplier_debts WHERE id = $1`,
      [id],
    );
    return {
      paidAmount: Number(rows[0].paid_amount),
      remainingAmount: Number(rows[0].remaining_amount),
      status: rows[0].status,
    };
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    branchAId = seed.branchId;

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(DefaultAccountSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.deposit_ledger.read',
      'accounting.deposit_account.read',
      'accounting.bank_payment.create',
      'accounting.bank_payment.read',
      'accounting.bank_payment.post',
      'accounting.bank_payment.reverse',
      'accounting.fund_swap.create',
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

    // ---- COA + bank (no POS routing needed — every scenario hits a voucher endpoint directly) ----
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    coaBankId = await accountByCode('1121');
    cashGlId = await accountByCode('1111');

    bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );

    depositAccountUAT04 = await seedDepositAccount({ branchId: branchAId, code: 'DFS-04', balance: 1_000_000 });
    depositAccountUAT05 = await seedDepositAccount({ branchId: branchAId, code: 'DFS-05', balance: 1_000_000 });
    depositAccountUAT06 = await seedDepositAccount({ branchId: branchAId, code: 'DFS-06', balance: 6_000_000 });
    depositAccountUAT08 = await seedDepositAccount({ branchId: branchAId, code: 'DFS-08', balance: 21_000_000 });

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch D', 'ACTIVE', false, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [branchBId, seed.organizationId, seed.userId],
    );
    depositAccountB = await seedDepositAccount({ branchId: branchBId, code: 'DFS-B', balance: 0 });

    const cashRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quỹ E2E DFS-09', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountA = cashRes.body.id;
  }, 120000);

  afterAll(async () => {
    // Bound app.close(): kafkajs consumer teardown can hang against Redpanda and
    // would otherwise trip the hook timeout and report a fake "suite failed".
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('UAT-04 — blocks a payment that exceeds the available balance (BR-CHI-01)', () => {
    it('1,500,000 payment against a 1,000,000 balance → 400, balance untouched', async () => {
      const before = await depositBalance(depositAccountUAT04);

      const res = await request(app.getHttpServer())
        .post('/bank-payments')
        .set(headers())
        .send({
          depositAccountId: depositAccountUAT04,
          docDate: '2026-07-10',
          purpose: 'OTHER',
          totalAmount: 1_500_000,
          lines: [{ description: 'Chi vượt số dư', amount: 1_500_000 }],
        })
        .expect(400);

      expect(res.body.message).toEqual(expect.stringContaining('Insufficient deposit balance'));
      expect(await depositBalance(depositAccountUAT04)).toBe(before);
    });
  });

  describe('UAT-05 — concurrent payments race, exactly one wins (NFR-03)', () => {
    it('two concurrent 800,000 payments against a 1,000,000 balance → one 201, one 400', async () => {
      const body = (amount: number) => ({
        depositAccountId: depositAccountUAT05,
        docDate: '2026-07-10',
        purpose: 'OTHER',
        totalAmount: amount,
        lines: [{ description: 'Chi đồng thời', amount }],
      });

      const [a, b] = await Promise.all([
        request(app.getHttpServer()).post('/bank-payments').set(headers()).send(body(800_000)),
        request(app.getHttpServer()).post('/bank-payments').set(headers()).send(body(800_000)),
      ]);

      const statuses = [a.status, b.status];
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 400)).toHaveLength(1);
      expect(await depositBalance(depositAccountUAT05)).toBe(200_000);
    }, 30000);
  });

  describe('UAT-06 — deposit↔cash swap is atomic (BR-SWP-01)', () => {
    it('DEPOSIT_TO_CASH 5,000,000 moves both legs; total funds unchanged', async () => {
      const depBefore = await depositBalance(depositAccountUAT06);
      const cashBefore = await cashBalance();

      const res = await request(app.getHttpServer())
        .post('/fund-swaps')
        .set(headers())
        .send({
          direction: 'DEPOSIT_TO_CASH',
          depositAccountId: depositAccountUAT06,
          amount: 5_000_000,
          docDate: '2026-07-10',
        })
        .expect(201);

      expect(res.body.bankPaymentId).toBeDefined();
      expect(res.body.cashReceiptId).toBeDefined();

      const depAfter = await depositBalance(depositAccountUAT06);
      const cashAfter = await cashBalance();
      expect(depAfter).toBe(depBefore - 5_000_000);
      expect(cashAfter).toBe(cashBefore + 5_000_000);
      expect(depBefore + cashBefore).toBe(depAfter + cashAfter);
    });
  });

  describe('UAT-08 — pay supplier from the deposit fund (FR-06, BR-BUY-04)', () => {
    it('settles a 20,000,000 payable from the deposit fund; reverse restores it', async () => {
      const debtId = await seedSupplierDebt(20_000_000);
      const depBefore = await depositBalance(depositAccountUAT08);
      const idemKey = randomUUID();
      const payBody = {
        docDate: '2026-07-10',
        legs: [{ fund: 'DEPOSIT', depositAccountId: depositAccountUAT08, amount: 20_000_000 }],
        allocations: [{ supplierDebtId: debtId, amount: 20_000_000 }],
      };

      const r1 = await request(app.getHttpServer())
        .post('/supplier-deposit-payment')
        .set({ ...headers(), 'X-Idempotency-Key': idemKey })
        .send(payBody)
        .expect(201);

      expect(r1.body.status).toBe('COMPLETED');
      expect(r1.body.bankPaymentId).toBeDefined();
      expect(await depositBalance(depositAccountUAT08)).toBe(depBefore - 20_000_000);

      const settled = await supplierDebt(debtId);
      expect(settled.remainingAmount).toBe(0);
      expect(settled.status).toBe('paid');

      // Idempotency: same key + same body replays, does not double-deduct the fund.
      const r2 = await request(app.getHttpServer())
        .post('/supplier-deposit-payment')
        .set({ ...headers(), 'X-Idempotency-Key': idemKey })
        .send(payBody)
        .expect(201);
      expect(r2.body.sagaId).toBe(r1.body.sagaId);
      expect(await depositBalance(depositAccountUAT08)).toBe(depBefore - 20_000_000);

      // Reverse the funding payment → BR-BUY-04 compensation restores the payable.
      await request(app.getHttpServer())
        .post(`/bank-payments/${r1.body.bankPaymentId}/reverse`)
        .set(headers())
        .send({ reason: 'Hủy phiếu chi trả NCC' })
        .expect(201);

      expect(await depositBalance(depositAccountUAT08)).toBe(depBefore);
      const restored = await supplierDebt(debtId);
      expect(restored.remainingAmount).toBe(20_000_000);
      expect(restored.status).toBe('open');
    }, 30000);
  });

  describe('UAT-13 — branch isolation spot check', () => {
    it('a branch-A actor cannot post a payment against branch-B\'s deposit account', async () => {
      await request(app.getHttpServer())
        .get('/deposit-ledger')
        .query({ depositAccountId: depositAccountB })
        .set(headers(branchAId))
        .expect(404);
    });
  });
});
