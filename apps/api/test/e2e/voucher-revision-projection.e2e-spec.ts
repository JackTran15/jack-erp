import { randomUUID } from 'crypto';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
 * Editing the SAME voucher twice in a row, with the staleness token read from
 * the grid each time — the exact loop that answered 409 in production.
 *
 * The first save proves nothing: a freshly created voucher sits at revision 0,
 * so a payload carrying a hard 0 matches by accident and the server says 200
 * even when the grid never received the real value. Only the SECOND save — with
 * the voucher now at revision 1 — separates a fixed read path from a broken one.
 *
 * Revision is read from `POST /v2/…/search` and never from the detail endpoint:
 * the grid is the path that was broken, so reading from anywhere else tests the
 * wrong thing.
 */
describe('Voucher revision reaches the grid (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let depositAccountId: string;

  const headers = () => ({
    Authorization: authHeader(seed.accessToken),
    'X-Branch-Id': seed.branchId,
  });

  const accountByCode = async (code: string): Promise<string> => {
    const rows = await ds.query(
      `SELECT id FROM accounts WHERE organization_id = $1 AND code = $2 LIMIT 1`,
      [seed.organizationId, code],
    );
    return rows[0].id;
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);

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
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_receipt.update',
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.cash_payment.update',
      'accounting.bank_receipt.create', 'accounting.bank_receipt.read',
      'accounting.bank_receipt.update',
      'accounting.bank_payment.create', 'accounting.bank_payment.read',
      'accounting.bank_payment.update',
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

    const cashGlId = await accountByCode('1111');
    const accRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quầy E2E', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountId = accRes.body.id;

    await ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121', 'Tiền gửi ngân hàng VND', 'ASSET', true, $2, NOW(), NOW())`,
      [seed.organizationId, seed.userId],
    );
    const coaBankId = await accountByCode('1121');
    const bankId = randomUUID();
    await ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES ($1, $2, 'VCB', 'Vietcombank', true, $3, NOW(), NOW())`,
      [bankId, seed.organizationId, seed.userId],
    );
    depositAccountId = randomUUID();
    await ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, 'Deposit E2E', 'DP1', 'ACC-DP1', 'ERP Test', $4,
               'BANK_ACCOUNT', $5, 0, '2026-01-01', 100000000, false, true,
               'ACTIVE', $6, NOW(), NOW())`,
      [depositAccountId, seed.organizationId, seed.branchId, bankId, coaBankId, seed.userId],
    );
  }, 300_000);

  afterAll(async () => {
    // Bound app.close(): kafkajs teardown can hang and report a fake failure.
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  type Kind = {
    label: string;
    path: string;
    table: string;
    searchPath: string;
    /** Narrows the grid query to this voucher's own money account. */
    scope: () => Record<string, unknown>;
    create: () => Record<string, unknown>;
  };

  const kinds = (): Kind[] => [
    {
      label: 'cash receipt',
      path: '/cash-receipts',
      table: 'cash_receipts',
      searchPath: '/v2/cash-vouchers/search',
      scope: () => ({ cashAccountId }),
      create: () => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 100000,
        lines: [{ description: 'Thu khác', amount: 100000 }],
      }),
    },
    {
      label: 'cash payment',
      path: '/cash-payments',
      table: 'cash_payments',
      searchPath: '/v2/cash-vouchers/search',
      scope: () => ({ cashAccountId }),
      create: () => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 50000,
        lines: [{ description: 'Chi khác', amount: 50000 }],
      }),
    },
    {
      label: 'bank receipt',
      path: '/bank-receipts',
      table: 'bank_receipts',
      searchPath: '/v2/deposit-vouchers/search',
      scope: () => ({ depositAccountId }),
      create: () => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 100000,
        lines: [{ description: 'Thu khác', amount: 100000 }],
      }),
    },
    {
      label: 'bank payment',
      path: '/bank-payments',
      table: 'bank_payments',
      searchPath: '/v2/deposit-vouchers/search',
      scope: () => ({ depositAccountId }),
      create: () => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 50000,
        lines: [{ description: 'Chi khác', amount: 50000 }],
      }),
    },
  ];

  describe.each(kinds())('$label', (kind) => {
    /** The revision as the grid reports it — `undefined` if it never arrives. */
    const revisionFromGrid = async (id: string): Promise<unknown> => {
      // /search keeps Nest's POST default (201).
      const res = await request(app.getHttpServer())
        .post(kind.searchPath)
        .set(headers())
        .send({ ...kind.scope(), limit: 100 })
        .expect(201);
      const row = (res.body.data as { id: string; revision?: unknown }[]).find(
        (r) => r.id === id,
      );
      expect(row).toBeDefined();
      return row!.revision;
    };

    const storedRevision = async (id: string): Promise<number> => {
      const rows = await ds.query(
        `SELECT revision FROM ${kind.table} WHERE id = $1`,
        [id],
      );
      return Number(rows[0].revision);
    };

    it('answers 200 on two consecutive edits driven by the grid revision', async () => {
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.create())
        .expect(201);
      const id: string = created.body.id;

      // A brand-new voucher must report 0, not `undefined`. This separates
      // "the query returns a real 0" from "the query returns nothing and the
      // adapter's `?? 0` invented one" — the two look identical downstream.
      expect(await revisionFromGrid(id)).toBe(0);

      // First save. Passes even on the broken build, because the hard 0 the
      // grid used to send happened to match. Kept for the round trip.
      await request(app.getHttpServer())
        .patch(`${kind.path}/${id}`)
        .set(headers())
        .send({ revision: (await revisionFromGrid(id)) as number, reason: 'Sửa lần 1' })
        .expect(200);
      expect(await storedRevision(id)).toBe(1);
      expect(await revisionFromGrid(id)).toBe(1);

      // Second save — the one that used to answer 409 with
      // "bản 1, bạn đang giữ bản 0".
      await request(app.getHttpServer())
        .patch(`${kind.path}/${id}`)
        .set(headers())
        .send({ revision: (await revisionFromGrid(id)) as number, reason: 'Sửa lần 2' })
        .expect(200);
      expect(await storedRevision(id)).toBe(2);
      expect(await revisionFromGrid(id)).toBe(2);
    });
  });
});
