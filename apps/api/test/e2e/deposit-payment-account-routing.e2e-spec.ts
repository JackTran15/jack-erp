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
 * Reproduces and proves the fix for a real production incident: two deposit
 * accounts sharing the same COA made non-cash POS checkout throw "Ambiguous
 * deposit COA" no matter what the cashier picked at checkout, because the
 * chosen `payment_accounts` row was discarded after COA resolution and never
 * reached the deposit-routing decision.
 *
 * Fix: `payment_accounts.deposit_account_id` names the exact fund; that choice
 * now flows checkout → invoice_payments.deposit_account_id → the Kafka event →
 * `DepositRoutingService.resolveDepositTarget`'s `explicitDepositAccountId`,
 * bypassing COA matching entirely for a line whose mapping named one.
 */
describe('Deposit fund — payment_accounts explicit deposit-account routing (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;

  let branchAId: string;
  let coaBankId: string; // the SHARED COA both deposit accounts deliberately use
  let bankId: string;
  let depositAccountShb: string;
  let depositAccountTcb: string;
  let itemId: string;
  let locationId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': branchAId,
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

  const movementsForInvoice = async (invoiceId: string): Promise<any[]> =>
    ds.query(
      `SELECT deposit_account_id, type, amount::text AS amount
         FROM deposit_movements
        WHERE source = 'POS_INVOICE' AND source_ref_id = $1`,
      [invoiceId],
    );

  const waitFor = async <T>(fn: () => Promise<T | null | undefined>, timeoutMs = 30000): Promise<T> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await fn();
      if (r) return r;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error('timeout waiting for eventual consistency');
  };

  const seedDepositAccount = async (opts: { code: string; balance: number }): Promise<string> => {
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
        branchAId,
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

  const createPaymentAccount = async (opts: {
    method: string;
    depositAccountId: string;
    label: string;
  }): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/admin/entities/payment-accounts/records')
      .set(headers())
      .send({
        paymentMethod: opts.method,
        branchId: branchAId,
        depositAccountId: opts.depositAccountId,
        label: opts.label,
      })
      .expect(201);
    return res.body.id;
  };

  const createAndCheckout = async (
    paymentMethod: string,
    paymentAccountId: string,
    amount: number,
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
            itemCode: 'ROUTE-ITEM',
            itemName: 'Routing Widget',
            unit: 'PCS',
            quantity: 1,
            unitPrice: amount,
          },
        ],
      })
      .expect(201);
    const invoiceId = create.body.id;

    await request(app.getHttpServer())
      .post(`/invoices/${invoiceId}/checkout`)
      .set(headers())
      .send({ payments: [{ paymentMethod, amount, paymentAccountId }] })
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
    await app.get(DefaultAccountSeederService).seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.deposit_ledger.read',
      'accounting.deposit_account.read',
      'accounting.payment_account.create',
      'accounting.payment_account.read',
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

    await ds.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uniq_deposit_movements_source_ref"
         ON "deposit_movements" ("source", "source_ref_id", "source_ref_line_id")`,
    );

    // Deliberately ONE COA shared by both deposit accounts — this is exactly
    // the incident's setup ("112" used by both "SHB" and "Lam Hoang An").
    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    coaBankId = await accountByCode('1121');

    bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );

    depositAccountShb = await seedDepositAccount({ code: 'SHB', balance: 0 });
    depositAccountTcb = await seedDepositAccount({ code: 'TCB', balance: 0 });

    const itemRes = await request(app.getHttpServer())
      .post('/inventory/items')
      .set(headers())
      .send({ code: 'ROUTE-ITEM', name: 'Routing Widget', unit: 'PCS', purchasePrice: 10, sellingPrice: 1000000 })
      .expect(201);
    itemId = itemRes.body.id;

    const storageRes = await request(app.getHttpServer())
      .post('/inventory/storages')
      .set(headers())
      .send({ name: 'ROUTE WH', branchId: branchAId })
      .expect(201);
    const locRes = await request(app.getHttpServer())
      .post('/inventory/locations')
      .set(headers())
      .send({ code: 'ROUTE-LOC', type: 'SHELF', name: 'Route Loc', storageId: storageRes.body.id, branchId: branchAId })
      .expect(201);
    locationId = locRes.body.id;
  }, 240000);

  afterAll(async () => {
    await Promise.race([app.close(), new Promise((resolve) => setTimeout(resolve, 15000))]);
  }, 60000);

  it('two payment_accounts mappings sharing one COA still route to their own distinct deposit fund', async () => {
    // Admin CRUD: create the two mappings via the real HTTP endpoint (not raw
    // SQL) — proves PaymentAccountsCrudService's accountId-sync + validation too.
    const paCard = await createPaymentAccount({
      method: 'card',
      depositAccountId: depositAccountShb,
      label: 'SHB card',
    });
    const paBankTransfer = await createPaymentAccount({
      method: 'bank_transfer',
      depositAccountId: depositAccountTcb,
      label: 'TCB transfer',
    });

    // The admin CRUD must have synced accountId from the linked deposit fund's own COA.
    const paRows = await ds.query(
      `SELECT id, account_id, deposit_account_id FROM payment_accounts WHERE id = ANY($1::uuid[])`,
      [[paCard, paBankTransfer]],
    );
    for (const row of paRows) {
      expect(row.account_id).toBe(coaBankId);
    }

    // Leg 1: card sale → must land in SHB, not TCB, and must NOT throw Ambiguous.
    const cardInvoiceId = await createAndCheckout('card', paCard, 500000);
    const cardRows = await waitFor(async () => {
      const r = await movementsForInvoice(cardInvoiceId);
      return r.length >= 1 ? r : null;
    }, 60000);
    expect(cardRows).toHaveLength(1);
    expect(cardRows[0].deposit_account_id).toBe(depositAccountShb);
    expect(Number(cardRows[0].amount)).toBe(500000);
    expect(await depositBalance(depositAccountShb)).toBe(500000);
    expect(await depositBalance(depositAccountTcb)).toBe(0);

    // Leg 2: bank_transfer sale → must land in TCB, not SHB, no ambiguity either.
    const transferInvoiceId = await createAndCheckout('bank_transfer', paBankTransfer, 300000);
    const transferRows = await waitFor(async () => {
      const r = await movementsForInvoice(transferInvoiceId);
      return r.length >= 1 ? r : null;
    }, 60000);
    expect(transferRows).toHaveLength(1);
    expect(transferRows[0].deposit_account_id).toBe(depositAccountTcb);
    expect(await depositBalance(depositAccountTcb)).toBe(300000);
    expect(await depositBalance(depositAccountShb)).toBe(500000); // unchanged by leg 2

    // The explicit choice is recorded on the payment line itself (audit trail).
    const paymentRows = await ds.query(
      `SELECT deposit_account_id FROM invoice_payments WHERE invoice_id = ANY($1::uuid[]) ORDER BY created_at ASC`,
      [[cardInvoiceId, transferInvoiceId]],
    );
    expect(paymentRows.map((r: any) => r.deposit_account_id)).toEqual([
      depositAccountShb,
      depositAccountTcb,
    ]);
  }, 180000);
});
