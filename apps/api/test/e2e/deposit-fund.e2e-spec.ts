import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  DepositMovementType,
  DepositMovementSource,
} from '@erp/shared-interfaces';
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
import { DepositService } from '../../src/modules/accounting/deposit/deposit.service';

/**
 * Deposit Fund Foundation (EPIC-15072026) UAT gate.
 *
 * Exercises the real POS non-cash path (HTTP checkout → Kafka → PosDepositSaleConsumer →
 * DepositService.createAndPostInternal) and the deposit detail ledger, asserting concrete
 * balances / row counts rather than HTTP status alone.
 *
 * Routing is COA-derived: a non-cash payment line lands in a deposit fund iff the payment
 * line's resolved COA (invoice_payments.account_id) matches an ACTIVE deposit_accounts.account_id
 * in the same org+branch. So the seed maps card + bank_transfer → the bank COA (1121), and a
 * branch-A deposit_accounts row carries account_id = that COA.
 *
 * The e2e harness rebuilds the schema from entity metadata (resetDatabase → synchronize(true)),
 * which does NOT recreate the migration-only composite unique index
 * `uniq_deposit_movements_source_ref`. UAT-03 needs it to prove the DB double-post guard, so the
 * suite recreates it after resetDatabase (idempotent; mirrors DepositFundFoundation migration).
 */
describe('Deposit Fund Foundation (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let depositService: DepositService;

  // Branch A is the seeded main branch; branch B is raw-seeded for isolation (UAT-13).
  let branchAId: string;
  const branchBId = 'b0000000-0000-4000-8000-0000000000b2';

  let coaBankId: string; // COA 1121 — the bank/deposit GL account (card + bank_transfer route here)
  let coaLedgerId: string; // COA 1122 — a distinct GL so DEP-LEDGER never collides with routing
  let revenueAccountId: string; // COA 511 — contra for POS sale deposits
  let cashGlId: string; // COA 1111
  let bankId: string; // banks.id

  let depositAccountA: string; // branch A deposit fund (card + bank_transfer route here)
  let depositAccountB: string; // branch B deposit fund (isolation)
  let ledgerAccountId: string; // dedicated deposit fund for the opening-balance test (UAT-12)

  let cashAccountA: string; // branch A cash fund (cash_accounts.id)
  let itemId: string;
  let locationId: string;

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
    const rows = await ds.query(
      `SELECT balance FROM deposit_accounts WHERE id = $1`,
      [accountId],
    );
    return Number(rows[0].balance);
  };

  const cashBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/cash/accounts/${cashAccountA}`)
      .set(headers())
      .expect(200);
    return Number(res.body.balance);
  };

  const movementsForInvoice = async (invoiceId: string): Promise<any[]> => {
    return ds.query(
      `SELECT id, deposit_account_id, type, amount::text AS amount,
              recon_status, source_ref_line_id, doc_date::text AS doc_date
         FROM deposit_movements
        WHERE source = 'POS_INVOICE' AND source_ref_id = $1
        ORDER BY created_at ASC`,
      [invoiceId],
    );
  };

  const waitFor = async <T>(
    fn: () => Promise<T | null | undefined>,
    timeoutMs = 30000,
  ): Promise<T> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await fn();
      if (r) return r;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error('timeout waiting for eventual consistency');
  };

  /** Create a draft invoice with a single line at `unitPrice`, then check it out. */
  const createAndCheckout = async (
    unitPrice: number,
    payments: Array<{ paymentMethod: string; amount: number }>,
  ): Promise<string> => {
    const create = await request(app.getHttpServer())
      .post('/invoices')
      .set(headers())
      .send({
        sessionId: randomUUID(),
        items: [
          {
            itemId,
            locationId,
            itemCode: 'DEP-ITEM',
            itemName: 'Deposit Widget',
            unit: 'PCS',
            quantity: 1,
            unitPrice,
          },
        ],
      })
      .expect(201);
    const invoiceId = create.body.id;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/checkout`)
      .set(headers())
      .send({ payments })
      .expect(201);

    return invoiceId;
  };

  const seedDepositMovement = async (opts: {
    accountId: string;
    branchId: string;
    type: DepositMovementType;
    amount: number;
    docDate: string;
    source?: DepositMovementSource;
  }): Promise<void> => {
    await ds.query(
      `INSERT INTO deposit_movements
         (id, organization_id, branch_id, deposit_account_id, type, amount,
          fee_amount, net_amount, doc_date, recon_status, source, created_by,
          created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 0, $5, $6, 'CHUA', $7, $8, NOW(), NOW())`,
      [
        seed.organizationId,
        opts.branchId,
        opts.accountId,
        opts.type,
        opts.amount,
        opts.docDate,
        opts.source ?? DepositMovementSource.MANUAL,
        seed.userId,
      ],
    );
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    depositService = app.get(DepositService);
    branchAId = seed.branchId;

    await app
      .get(CoaSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(DefaultAccountSeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    // Grant the deposit read permissions to the seeded admin role.
    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.deposit_ledger.read',
      'accounting.deposit_account.read',
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

    // Defensive: DepositMovementEntity now declares this unique index so synchronize
    // creates it, but ensure the DB double-post guard exists regardless of ordering (UAT-03).
    await ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_deposit_movements_source_ref"
         ON "deposit_movements" ("source", "source_ref_id", "source_ref_line_id")`,
    );

    // ---- COA + bank ------------------------------------------------------
    revenueAccountId = await accountByCode('511');
    cashGlId = await accountByCode('1111');
    // Distinct bank COA (child of 112) that card/bank_transfer map to. A second COA (1122)
    // backs the ledger-only fund so it never shares a COA with fund A in the same branch
    // (which would make routing ambiguous).
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW()),
              (gen_random_uuid(), $1, '1122', 'Tiền gửi ngân hàng USD', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    coaBankId = await accountByCode('1121');
    coaLedgerId = await accountByCode('1122');

    bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );

    // ---- payment_accounts (org-wide, branch NULL): card + bank_transfer → bank COA; cash → 1111 ----
    const seedPaymentAccount = async (method: string, accountId: string) => {
      await ds.query(
        `INSERT INTO payment_accounts
           (id, organization_id, branch_id, payment_method, account_id, is_active, sort_order, created_by, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, NULL, $2, $3, true, 0, $4, NOW(), NOW())`,
        [seed.organizationId, method, accountId, seed.userId],
      );
    };
    await seedPaymentAccount('card', coaBankId);
    await seedPaymentAccount('bank_transfer', coaBankId);
    await seedPaymentAccount('cash', cashGlId);

    // ---- deposit_accounts -------------------------------------------------
    const seedDepositAccount = async (opts: {
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
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'BANK_ACCOUNT', $9, $10, '2026-01-01', $11,
                 false, false, 'ACTIVE', $12, NOW(), NOW())`,
        [
          id,
          seed.organizationId,
          opts.branchId,
          `Deposit ${opts.code}`,
          opts.code,
          `ACC-${opts.code}`,
          'ERP Test',
          bankId,
          opts.accountId,
          opts.openingBalance,
          opts.balance,
          seed.userId,
        ],
      );
      return id;
    };

    depositAccountA = await seedDepositAccount({
      branchId: branchAId,
      code: 'DEP-A',
      accountId: coaBankId,
      openingBalance: 0,
      balance: 0,
    });

    // Branch B + its deposit fund (isolation).
    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch B', 'ACTIVE', false, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [branchBId, seed.organizationId, seed.userId],
    );
    depositAccountB = await seedDepositAccount({
      branchId: branchBId,
      code: 'DEP-B',
      accountId: coaBankId,
      openingBalance: 0,
      balance: 500000,
    });
    await seedDepositMovement({
      accountId: depositAccountB,
      branchId: branchBId,
      type: DepositMovementType.DEPOSIT,
      amount: 500000,
      docDate: '2026-05-15',
    });

    // Dedicated fund for the ledger opening-balance test (branch A).
    ledgerAccountId = await seedDepositAccount({
      branchId: branchAId,
      code: 'DEP-LEDGER',
      accountId: coaLedgerId,
      openingBalance: 1000000,
      balance: 1200000,
    });
    await seedDepositMovement({
      accountId: ledgerAccountId,
      branchId: branchAId,
      type: DepositMovementType.DEPOSIT,
      amount: 200000,
      docDate: '2026-04-15',
    });
    await seedDepositMovement({
      accountId: ledgerAccountId,
      branchId: branchAId,
      type: DepositMovementType.DEPOSIT,
      amount: 300000,
      docDate: '2026-05-10',
    });
    await seedDepositMovement({
      accountId: ledgerAccountId,
      branchId: branchAId,
      type: DepositMovementType.WITHDRAWAL,
      amount: 100000,
      docDate: '2026-05-20',
    });

    // ---- branch A cash fund (single fund per branch, mapped to 1111) ----
    const cashRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quỹ E2E Deposit', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountA = cashRes.body.id;

    // ---- inventory item + showroom location (checkout requires a line location) ----
    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'DEP-ITEM',
        name: 'Deposit Widget',
        unit: 'PCS',
        purchasePrice: 10,
        sellingPrice: 1135000,
      })
      .expect(201);
    itemId = itemRes.body.id;

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'DEP WH', branchId: branchAId })
      .expect(201);

    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({
        code: 'DEP-LOC',
        type: 'SHELF',
        name: 'DEP Loc',
        storageId: storageRes.body.id,
        branchId: branchAId,
      })
      .expect(201);
    locationId = locRes.body.id;
  }, 120000);

  afterAll(async () => {
    // Bound app.close(): kafkajs consumer teardown can hang against Redpanda and
    // would otherwise trip the hook timeout and report a fake "suite failed".
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  // Shared across UAT-01 / UAT-03.
  let uat01InvoiceId: string;
  let uat01PaymentLineId: string;
  let uat01DocDate: string;

  describe('UAT-01 — card sale auto-posts a single deposit movement', () => {
    it('checkout(card 1135000) → one DEPOSIT movement, balance +1135000, appears in ledger', async () => {
      const before = await depositBalance(depositAccountA);

      uat01InvoiceId = await createAndCheckout(1135000, [
        { paymentMethod: 'card', amount: 1135000 },
      ]);

      const rows = await waitFor(async () => {
        const r = await movementsForInvoice(uat01InvoiceId);
        return r.length >= 1 ? r : null;
      });

      expect(rows).toHaveLength(1);
      const m = rows[0];
      expect(m.deposit_account_id).toBe(depositAccountA);
      expect(m.type).toBe('DEPOSIT');
      expect(Number(m.amount)).toBe(1135000);
      expect(m.recon_status).toBe('CHUA');
      uat01DocDate = m.doc_date;

      expect(await depositBalance(depositAccountA)).toBe(before + 1135000);

      // The card payment line drives the movement's source_ref_line_id.
      const payRows = await ds.query(
        `SELECT id FROM invoice_payments WHERE invoice_id = $1`,
        [uat01InvoiceId],
      );
      expect(payRows).toHaveLength(1);
      uat01PaymentLineId = payRows[0].id;
      expect(m.source_ref_line_id).toBe(uat01PaymentLineId);

      // Ledger surfaces the movement for branch A on its doc date.
      const ledger = await request(app.getHttpServer())
        .get('/deposit-ledger')
        .query({
          depositAccountId: depositAccountA,
          dateFrom: uat01DocDate,
          dateTo: uat01DocDate,
        })
        .set(headers())
        .expect(200);
      const ledgerRow = ledger.body.rows.find((r: any) => r.id === m.id);
      expect(ledgerRow).toBeDefined();
      expect(Number(ledgerRow.amountIn)).toBe(1135000);
      expect(Number(ledgerRow.amountOut)).toBe(0);
    }, 60000);
  });

  describe('UAT-02 — split cash + bank_transfer posts to two funds independently', () => {
    it('checkout(cash 500000 + bank_transfer 635000) → cash +500000 AND deposit +635000', async () => {
      const cashBefore = await cashBalance();
      const depositBefore = await depositBalance(depositAccountA);

      const invoiceId = await createAndCheckout(1135000, [
        { paymentMethod: 'cash', amount: 500000 },
        { paymentMethod: 'bank_transfer', amount: 635000 },
      ]);

      // Deposit side: the bank_transfer line lands in fund A.
      const depMovement = await waitFor(async () => {
        const r = await movementsForInvoice(invoiceId);
        return r.length >= 1 ? r[0] : null;
      });
      expect(depMovement.type).toBe('DEPOSIT');
      expect(Number(depMovement.amount)).toBe(635000);
      expect(depMovement.deposit_account_id).toBe(depositAccountA);
      expect(await depositBalance(depositAccountA)).toBe(depositBefore + 635000);

      // Cash side: the cash line lands in the branch cash fund (separate posting).
      const cashAfter = await waitFor(async () => {
        const b = await cashBalance();
        return b === cashBefore + 500000 ? b : null;
      });
      expect(cashAfter).toBe(cashBefore + 500000);
    }, 60000);
  });

  describe('UAT-03 — idempotency: no duplicate movement per (invoice, payment line)', () => {
    it('createAndPostInternal replays; raw duplicate insert violates the DB guard', async () => {
      const actor = {
        userId: seed.userId,
        organizationId: seed.organizationId,
        branchId: branchAId,
        roles: [],
      };
      const dto = {
        depositAccountId: depositAccountA,
        type: DepositMovementType.DEPOSIT,
        amount: 1135000,
        contraAccountId: revenueAccountId,
        source: DepositMovementSource.POS_INVOICE,
        sourceRefId: uat01InvoiceId,
        sourceRefLineId: uat01PaymentLineId,
        docDate: uat01DocDate,
        documentNumber: 'DEP-UAT03',
      };

      const balanceBefore = await depositBalance(depositAccountA);

      const r1 = await depositService.createAndPostInternal(dto, actor);
      const r2 = await depositService.createAndPostInternal(dto, actor);
      expect(r1.replayed).toBe(true);
      expect(r2.replayed).toBe(true);

      const cnt = await ds.query(
        `SELECT COUNT(*)::int AS c FROM deposit_movements
          WHERE source = 'POS_INVOICE' AND source_ref_id = $1 AND source_ref_line_id = $2`,
        [uat01InvoiceId, uat01PaymentLineId],
      );
      expect(cnt[0].c).toBe(1);
      expect(await depositBalance(depositAccountA)).toBe(balanceBefore);

      // DB-layer guard: a raw duplicate at (source, source_ref_id, source_ref_line_id) is rejected.
      await expect(
        ds.query(
          `INSERT INTO deposit_movements
             (id, organization_id, branch_id, deposit_account_id, type, amount,
              fee_amount, net_amount, doc_date, recon_status, source, source_ref_id,
              source_ref_line_id, created_by, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, 'DEPOSIT', 1135000, 0, 1135000, $4,
                   'CHUA', 'POS_INVOICE', $5, $6, $7, NOW(), NOW())`,
          [
            seed.organizationId,
            branchAId,
            depositAccountA,
            uat01DocDate,
            uat01InvoiceId,
            uat01PaymentLineId,
            seed.userId,
          ],
        ),
      ).rejects.toThrow();
    }, 60000);
  });

  describe('UAT-12 — ledger opening balance & running balance', () => {
    it('opening = account opening + signed sum before dateFrom; running balance is correct', async () => {
      const res = await request(app.getHttpServer())
        .get('/deposit-ledger')
        .query({
          depositAccountId: ledgerAccountId,
          dateFrom: '2026-05-01',
          dateTo: '2026-05-31',
        })
        .set(headers())
        .expect(200);

      // opening = 1_000_000 (account) + 200_000 (April DEPOSIT before May) = 1_200_000
      expect(Number(res.body.openingBalance)).toBe(1200000);
      // May movements only (April is folded into opening); opening row is NOT counted.
      expect(res.body.total).toBe(2);
      expect(res.body.rows).toHaveLength(2);

      // Row order is doc_date ASC. First May row: DEPOSIT 300000 → running 1_500_000.
      const first = res.body.rows[0];
      expect(Number(first.amountIn)).toBe(300000);
      expect(Number(first.runningBalance)).toBe(1500000);

      // Second May row: WITHDRAWAL 100000 → running 1_400_000.
      const second = res.body.rows[1];
      expect(Number(second.amountOut)).toBe(100000);
      expect(Number(second.runningBalance)).toBe(1400000);

      expect(Number(res.body.closingBalance)).toBe(1400000);
    });
  });

  describe('UAT-13 — branch isolation', () => {
    it('branch-A user sees only branch-A deposit data (ledger + CRUD list)', async () => {
      // A's own account: ledger returns A's data.
      const own = await request(app.getHttpServer())
        .get('/deposit-ledger')
        .query({ depositAccountId: depositAccountA })
        .set(headers(branchAId))
        .expect(200);
      expect(own.body.rows.length).toBeGreaterThan(0);

      // B's account requested under branch A → 404 (service branch filter).
      await request(app.getHttpServer())
        .get('/deposit-ledger')
        .query({ depositAccountId: depositAccountB })
        .set(headers(branchAId))
        .expect(404);

      // Generic CRUD list under branch A must exclude branch B's account.
      const list = await request(app.getHttpServer())
        .get('/admin/entities/deposit-accounts/records')
        .query({ pageSize: 100 })
        .set(headers(branchAId))
        .expect(200);
      const ids = list.body.data.map((r: any) => r.id);
      expect(ids).toContain(depositAccountA);
      expect(ids).not.toContain(depositAccountB);
      for (const row of list.body.data) {
        expect(row.branchId).toBe(branchAId);
      }
    });
  });
});
