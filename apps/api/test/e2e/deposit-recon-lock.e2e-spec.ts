import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { DepositMovementType, DepositMovementSource } from '@erp/shared-interfaces';
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
import { CashVoucherCategorySeederService } from '../../src/modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';

/**
 * Deposit Fund Reconcile & Lock (EPIC-15072026, GĐ3) UAT gate.
 *
 * Covers UAT-09 (reconcile discrepancy proposes a fee adjustment without
 * touching the fund balance), UAT-10 (cancelling a reconciled card invoice is
 * blocked; cancelling an unreconciled one reverses gross only, fee kept),
 * UAT-11 (period lock blocks a bank_payment dated inside the locked period;
 * unlock restores it), UAT-13 (branch isolation), and idempotent replay.
 */
describe('Deposit Reconcile & Lock (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  const branchBId = 'b0000000-0000-4000-8000-0000000000c3';

  let coaBankId: string; // COA 1121 — card/bank_transfer route here
  let coaPayableId: string; // COA 331 (already seeded by CoaSeederService)
  let bankId: string;

  let depositAccountA: string;
  let depositAccountB: string;

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
    const rows = await ds.query(`SELECT balance FROM deposit_accounts WHERE id = $1`, [
      accountId,
    ]);
    return Number(rows[0].balance);
  };

  const movementsForInvoice = async (invoiceId: string): Promise<any[]> =>
    ds.query(
      `SELECT id, deposit_account_id, type, amount::text AS amount, fee_amount::text AS fee_amount,
              recon_status, source_ref_line_id, doc_date::text AS doc_date
         FROM deposit_movements
        WHERE source = 'POS_INVOICE' AND source_ref_id = $1
        ORDER BY created_at ASC`,
      [invoiceId],
    );

  const seedDepositMovement = async (opts: {
    accountId: string;
    branchId: string;
    amount: number;
    netAmount: number;
    docDate: string;
  }): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO deposit_movements
         (id, organization_id, branch_id, deposit_account_id, type, amount,
          fee_amount, net_amount, doc_date, recon_status, source, created_by,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'DEPOSIT', $5, 0, $6, $7, 'CHUA', 'MANUAL', $8, NOW(), NOW())`,
      [
        id,
        seed.organizationId,
        opts.branchId,
        opts.accountId,
        opts.amount,
        opts.netAmount,
        opts.docDate,
        seed.userId,
      ],
    );
    return id;
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

  /** Poll a fixed window and assert the condition holds throughout (for "nothing happened" cases). */
  const assertStaysTrue = async (
    fn: () => Promise<boolean>,
    windowMs = 4000,
  ): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < windowMs) {
      if (!(await fn())) {
        throw new Error('condition became false during the stability window');
      }
      await new Promise((res) => setTimeout(res, 500));
    }
  };

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
            itemCode: 'DFR-ITEM',
            itemName: 'Recon Widget',
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
    await app
      .get(CashVoucherCategorySeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    // ---- grant the GĐ2/GĐ3 permissions this suite exercises ----
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
      'accounting.bank_receipt.create',
      'accounting.bank_receipt.read',
      'accounting.deposit_recon.read',
      'accounting.deposit_recon.reconcile',
      'accounting.deposit_recon.unreconcile',
      'accounting.deposit_recon.export',
      'accounting.deposit_period.read',
      'accounting.deposit_period.lock',
      'accounting.deposit_period.unlock',
      'accounting.deposit_audit.read',
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

    // ---- COA + bank + payment routing (mirrors deposit-fund.e2e-spec.ts) ----
    coaPayableId = await accountByCode('331');
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

    // 1.1% acquirer fee on card, MERCHANT-borne (R1 worked example: 1,135,000 → fee 12,485).
    await ds.query(
      `INSERT INTO deposit_payment_policy
         (id, organization_id, branch_id, payment_method, fee_rate, fee_bearer,
          settlement_days, effective_from, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 'card', 0.011, 'MERCHANT', 0, '2026-01-01', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    const policyCheck = await ds.query(
      `SELECT payment_method, fee_rate, fee_bearer FROM deposit_payment_policy WHERE organization_id = $1`,
      [seed.organizationId],
    );
    if (policyCheck.length !== 1) {
      throw new Error(
        `deposit_payment_policy seed sanity check failed: expected 1 row, got ${JSON.stringify(policyCheck)}`,
      );
    }

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
                 true, false, 'ACTIVE', $11, NOW(), NOW())`,
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
      return id;
    };

    // allow_negative=true so UAT-09's seeded movements don't need a real balance.
    depositAccountA = await seedDepositAccount({ branchId: branchAId, code: 'DFR-A', balance: 0 });

    await ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch C', 'ACTIVE', false, $3, NOW(), NOW())
       ON CONFLICT (id) DO NOTHING`,
      [branchBId, seed.organizationId, seed.userId],
    );
    depositAccountB = await seedDepositAccount({ branchId: branchBId, code: 'DFR-B', balance: 0 });

    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({
        code: 'DFR-ITEM',
        name: 'Recon Widget',
        unit: 'PCS',
        purchasePrice: 10,
        sellingPrice: 1135000,
      })
      .expect(201);
    itemId = itemRes.body.id;

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'DFR WH', branchId: branchAId })
      .expect(201);
    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({
        code: 'DFR-LOC',
        type: 'SHELF',
        name: 'DFR Loc',
        storageId: storageRes.body.id,
        branchId: branchAId,
      })
      .expect(201);
    locationId = locRes.body.id;
  }, 120000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('UAT-09 — reconcile discrepancy proposes a fee adjustment, fund unchanged', () => {
    it('statement short by 12,485 → LECH, DRAFT bank_payment proposal, balance untouched (BR-REC-03)', async () => {
      const m1 = await seedDepositMovement({
        accountId: depositAccountA,
        branchId: branchAId,
        amount: 1_000_000,
        netAmount: 1_000_000,
        docDate: '2026-06-01',
      });
      const m2 = await seedDepositMovement({
        accountId: depositAccountA,
        branchId: branchAId,
        amount: 1_000_000,
        netAmount: 1_000_000,
        docDate: '2026-06-02',
      });
      const m3 = await seedDepositMovement({
        accountId: depositAccountA,
        branchId: branchAId,
        amount: 1_000_000,
        netAmount: 1_000_000,
        docDate: '2026-06-03',
      });
      const movementIds = [m1, m2, m3];
      const systemTotal = 3_000_000;
      const balanceBefore = await depositBalance(depositAccountA);

      // Missing note on a discrepancy → 400 (BR-REC-02).
      await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers())
        .send({
          depositAccountId: depositAccountA,
          movementIds,
          stmtTotalAmount: systemTotal - 12485,
          stmtFromDate: '2026-06-01',
          stmtToDate: '2026-06-03',
        })
        .expect(400);

      const res = await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers())
        .send({
          depositAccountId: depositAccountA,
          movementIds,
          stmtTotalAmount: systemTotal - 12485,
          stmtFromDate: '2026-06-01',
          stmtToDate: '2026-06-03',
          note: 'Chênh lệch phí acquirer thực tế',
        })
        .expect(201);

      expect(res.body.status).toBe('DISCREPANCY');
      expect(Number(res.body.diffAmount)).toBe(-12485);
      expect(res.body.proposalId).toBeDefined();

      const statuses = await ds.query(
        `SELECT recon_status FROM deposit_movements WHERE id = ANY($1::uuid[])`,
        [movementIds],
      );
      expect(statuses.map((r: any) => r.recon_status)).toEqual(['LECH', 'LECH', 'LECH']);

      // BR-REC-03: no auto balance reduction — the fund is untouched.
      expect(await depositBalance(depositAccountA)).toBe(balanceBefore);

      // The proposal is a DRAFT bank_payment (never posted, never touches balance).
      const drafts = await ds.query(
        `SELECT status, purpose, total_amount::text AS total_amount
           FROM bank_payments WHERE id = $1`,
        [res.body.proposalId],
      );
      expect(drafts).toHaveLength(1);
      expect(drafts[0].status).toBe('DRAFT');
      expect(drafts[0].purpose).toBe('BANK_FEE');
      expect(Number(drafts[0].total_amount)).toBe(12485);

      // Double-reconcile: these movements are no longer CHUA → 400.
      await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers())
        .send({
          depositAccountId: depositAccountA,
          movementIds,
          stmtTotalAmount: systemTotal,
          stmtFromDate: '2026-06-01',
          stmtToDate: '2026-06-03',
        })
        .expect(400);
    }, 60000);

    it('unreconcile resets CHUA and records an audit row (BR-PERM-03)', async () => {
      const id = await seedDepositMovement({
        accountId: depositAccountA,
        branchId: branchAId,
        amount: 500000,
        netAmount: 500000,
        docDate: '2026-06-05',
      });

      const reconcileRes = await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers())
        .send({
          depositAccountId: depositAccountA,
          movementIds: [id],
          stmtTotalAmount: 500000,
          stmtFromDate: '2026-06-05',
          stmtToDate: '2026-06-05',
        })
        .expect(201);
      expect(reconcileRes.body.status).toBe('RECONCILED');

      await request(app.getHttpServer())
        .post('/deposit-recon/unreconcile')
        .set(headers())
        .send({ movementIds: [id], reason: 'Sao kê nhập sai' })
        .expect(201);

      const rows = await ds.query(
        `SELECT recon_status, recon_batch_id FROM deposit_movements WHERE id = $1`,
        [id],
      );
      expect(rows[0].recon_status).toBe('CHUA');
      expect(rows[0].recon_batch_id).toBeNull();

      const audit = await ds.query(
        `SELECT action FROM deposit_audit_log WHERE entity_id = $1 AND action = 'UNRECONCILE'`,
        [id],
      );
      expect(audit.length).toBeGreaterThan(0);
    });

    it('idempotent replay: same X-Idempotency-Key does not double-reconcile', async () => {
      const id = await seedDepositMovement({
        accountId: depositAccountA,
        branchId: branchAId,
        amount: 200000,
        netAmount: 200000,
        docDate: '2026-06-06',
      });
      const idemKey = randomUUID();
      const body = {
        depositAccountId: depositAccountA,
        movementIds: [id],
        stmtTotalAmount: 200000,
        stmtFromDate: '2026-06-06',
        stmtToDate: '2026-06-06',
      };

      const r1 = await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set({ ...headers(), 'X-Idempotency-Key': idemKey })
        .send(body)
        .expect(201);
      const r2 = await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set({ ...headers(), 'X-Idempotency-Key': idemKey })
        .send(body)
        .expect(201);

      expect(r2.body.batch.id).toBe(r1.body.batch.id);
      const batches = await ds.query(
        `SELECT COUNT(*)::int AS c FROM deposit_recon_batch WHERE id = $1`,
        [r1.body.batch.id],
      );
      expect(batches[0].c).toBe(1);
    });
  });

  describe('UAT-10 — cancel a non-cash POS invoice', () => {
    it('reconciled movement: cancel is blocked, original kept, fee never touched (BR-REF-01/02/03)', async () => {
      const invoiceId = await createAndCheckout(1135000, [
        { paymentMethod: 'card', amount: 1135000 },
      ]);
      const rows = await waitFor(async () => {
        const r = await movementsForInvoice(invoiceId);
        return r.length >= 2 ? r : null; // gross + fee
      }, 150000);
      const gross = rows.find((r) => r.type === 'DEPOSIT')!;
      expect(Number(gross.fee_amount)).toBe(12485);

      await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers())
        .send({
          depositAccountId: depositAccountA,
          movementIds: [gross.id],
          stmtTotalAmount: Number(gross.amount) - 12485,
          stmtFromDate: gross.doc_date,
          stmtToDate: gross.doc_date,
        })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/cancel`)
        .set(headers())
        .send({ reason: 'Khách đổi ý' })
        .expect(201);

      // BR-REF-02: async reversal is blocked (a WARN, not a thrown HTTP error) —
      // assert no REVERSAL sibling appears and the gross row is untouched.
      await assertStaysTrue(async () => {
        const after = await movementsForInvoice(invoiceId);
        const reversal = after.find((r) => r.source_ref_line_id?.endsWith('-REVERSAL'));
        const stillLecOrDa = after.find((r) => r.id === gross.id)?.recon_status;
        return !reversal && (stillLecOrDa === 'DA' || stillLecOrDa === 'LECH');
      });
    }, 200000);

    it('unreconciled movement: cancel reverses gross only, fee movement is untouched (BR-REF-01/03)', async () => {
      const invoiceId = await createAndCheckout(1135000, [
        { paymentMethod: 'card', amount: 1135000 },
      ]);
      const before = await waitFor(async () => {
        const r = await movementsForInvoice(invoiceId);
        return r.length >= 2 ? r : null;
      }, 150000);
      const gross = before.find((r) => r.type === 'DEPOSIT')!;
      const fee = before.find((r) => r.source_ref_line_id === 'FEE')!;
      expect(Number(fee.amount)).toBe(12485);
      const balanceBefore = await depositBalance(depositAccountA);

      await request(app.getHttpServer())
        .post(`/invoices/${invoiceId}/cancel`)
        .set(headers())
        .send({ reason: 'Hết hàng, hủy đơn' })
        .expect(201);

      const after = await waitFor(async () => {
        const r = await movementsForInvoice(invoiceId);
        const reversal = r.find((row) => row.source_ref_line_id?.endsWith('-REVERSAL'));
        return reversal ? r : null;
      }, 150000);

      expect(after).toHaveLength(3); // gross + fee + reversal
      const reversal = after.find((r) => r.source_ref_line_id?.endsWith('-REVERSAL'))!;
      expect(reversal.type).toBe('WITHDRAWAL');
      expect(Number(reversal.amount)).toBe(1135000);

      // The original gross row is kept (not deleted) — BR-REF-01.
      const stillThere = after.find((r) => r.id === gross.id);
      expect(stillThere).toBeDefined();
      // The fee row is untouched — BR-REF-03 (no reversal sibling keyed off it).
      const feeStillThere = after.find((r) => r.id === fee.id);
      expect(feeStillThere).toBeDefined();
      expect(after.some((r) => r.source_ref_line_id === 'FEE-REVERSAL')).toBe(false);

      // Net balance change = -fee (gross fully unwound, fee stays a real cost).
      expect(await depositBalance(depositAccountA)).toBe(balanceBefore - 1135000);
    }, 320000);
  });

  describe('UAT-11 — period lock blocks a bank_payment dated inside the locked period', () => {
    const makeBankPaymentBody = (docDate: string) => ({
      depositAccountId: depositAccountA,
      docDate,
      purpose: 'OTHER',
      totalAmount: 10000,
      lines: [{ description: 'Chi phí văn phòng', amount: 10000 }],
    });

    it('locks 2026-06, blocks a payment dated inside it, allows one outside it, then unlock restores it', async () => {
      // force=true: earlier UAT-09 subtests leave a few June movements CHUA
      // (dated well over 7 days before "today" in this fixed test dataset),
      // which correctly trips BR-REC-04's stale-unreconciled warning.
      const lockRes = await request(app.getHttpServer())
        .post('/deposit-period-locks')
        .set(headers())
        .send({ branchId: branchAId, period: '2026-06', force: true })
        .expect(201);
      expect(lockRes.body.status).toBe('LOCKED');
      expect(Array.isArray(lockRes.body.closingBalanceSnapshot)).toBe(true);
      const snapshotRow = lockRes.body.closingBalanceSnapshot.find(
        (s: any) => s.depositAccountId === depositAccountA,
      );
      expect(snapshotRow).toBeDefined(); // BR-LOCK-03

      // Re-locking the same period → 409.
      await request(app.getHttpServer())
        .post('/deposit-period-locks')
        .set(headers())
        .send({ branchId: branchAId, period: '2026-06' })
        .expect(409);

      // Inside the locked period → 409 (BR-LOCK-01).
      await request(app.getHttpServer())
        .post('/bank-payments')
        .set(headers())
        .send(makeBankPaymentBody('2026-06-15'))
        .expect(409);

      // Outside the locked period → succeeds.
      await request(app.getHttpServer())
        .post('/bank-payments')
        .set(headers())
        .send(makeBankPaymentBody('2026-07-01'))
        .expect(201);

      // Unlock requires a reason.
      await request(app.getHttpServer())
        .post(`/deposit-period-locks/${lockRes.body.id}/unlock`)
        .set(headers())
        .send({})
        .expect(400);

      await request(app.getHttpServer())
        .post(`/deposit-period-locks/${lockRes.body.id}/unlock`)
        .set(headers())
        .send({ reason: 'Điều chỉnh sổ tháng 6' })
        .expect(201);

      // After unlock, the same docDate now succeeds.
      await request(app.getHttpServer())
        .post('/bank-payments')
        .set(headers())
        .send(makeBankPaymentBody('2026-06-15'))
        .expect(201);
    }, 60000);
  });

  describe('UAT-13 — branch isolation', () => {
    it('branch-A actor cannot see or reconcile branch-B deposit-recon rows', async () => {
      const bMovementId = await seedDepositMovement({
        accountId: depositAccountB,
        branchId: branchBId,
        amount: 100000,
        netAmount: 100000,
        docDate: '2026-06-10',
      });

      // List under branch A never returns branch B's account/movements.
      const list = await request(app.getHttpServer())
        .get('/deposit-recon')
        .query({ depositAccountId: depositAccountB })
        .set(headers(branchAId))
        .expect(200);
      expect(list.body.data).toHaveLength(0);

      // Attempting to reconcile branch B's movement while scoped to branch A finds
      // nothing in the branch-filtered lock query → 400 (not a silent cross-tenant post).
      await request(app.getHttpServer())
        .post('/deposit-recon/reconcile')
        .set(headers(branchAId))
        .send({
          depositAccountId: depositAccountB,
          movementIds: [bMovementId],
          stmtTotalAmount: 100000,
          stmtFromDate: '2026-06-10',
          stmtToDate: '2026-06-10',
        })
        .expect(400);
    });
  });
});
