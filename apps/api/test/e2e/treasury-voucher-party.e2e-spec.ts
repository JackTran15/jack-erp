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
 * A hand-typed "Đối tượng" — the party a user writes instead of picking from a
 * catalogue — across all four treasury voucher types.
 *
 * One table drives every case on purpose. The two modules declare PARALLEL
 * enums (`CashVoucherPartnerType` / `BankVoucherPartnerType`, and two Postgres
 * enum types) and parallel services, so the real risk of this feature is fixing
 * one side and forgetting its twin. A per-type test would let that pass; a
 * shared table cannot.
 */
describe('Treasury voucher free-text party (E2E)', () => {
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
      'accounting.cash_receipt.update', 'accounting.cash_receipt.delete',
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.cash_payment.update', 'accounting.cash_payment.delete',
      'accounting.bank_receipt.create', 'accounting.bank_receipt.read',
      'accounting.bank_receipt.update', 'accounting.bank_receipt.delete',
      'accounting.bank_payment.create', 'accounting.bank_payment.read',
      'accounting.bank_payment.update', 'accounting.bank_payment.delete',
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

    // Deposit side: 1121 + a bank + one account, mirroring deposit-recon-lock.
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
  }, 180000);

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
    body: (over: Record<string, unknown>) => Record<string, unknown>;
  };

  const kinds = (): Kind[] => [
    {
      label: 'cash receipt',
      path: '/cash-receipts',
      table: 'cash_receipts',
      body: (over) => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 100000,
        lines: [{ description: 'Thu khác', amount: 100000 }],
        ...over,
      }),
    },
    {
      label: 'cash payment',
      path: '/cash-payments',
      table: 'cash_payments',
      body: (over) => ({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: 50000,
        lines: [{ description: 'Chi khác', amount: 50000 }],
        ...over,
      }),
    },
    {
      label: 'bank receipt',
      path: '/bank-receipts',
      table: 'bank_receipts',
      body: (over) => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 100000,
        lines: [{ description: 'Thu khác', amount: 100000 }],
        ...over,
      }),
    },
    {
      label: 'bank payment',
      path: '/bank-payments',
      table: 'bank_payments',
      body: (over) => ({
        docDate: '2026-06-30',
        depositAccountId,
        totalAmount: 50000,
        lines: [{ description: 'Chi khác', amount: 50000 }],
        ...over,
      }),
    },
  ];

  describe.each(kinds())('$label', (kind) => {
    it('stores a hand-typed party name and leaves partner_id null', async () => {
      const res = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.body({ partnerType: 'OTHER', partnerName: '  Nguyễn Văn A  ' }))
        .expect(201);

      const rows = await ds.query(
        `SELECT partner_type, partner_id, partner_name_snapshot
           FROM ${kind.table} WHERE id = $1`,
        [res.body.id],
      );
      expect(rows[0].partner_type).toBe('OTHER');
      expect(rows[0].partner_id).toBeNull();
      // Trimmed on the way in — a stray space must not become part of the name.
      expect(rows[0].partner_name_snapshot).toBe('Nguyễn Văn A');
    });

    it('drops a partnerId sent alongside a hand-typed party', async () => {
      const res = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(
          kind.body({
            partnerType: 'OTHER',
            partnerName: 'Trần Thị B',
            partnerId: randomUUID(),
          }),
        )
        .expect(201);

      const rows = await ds.query(
        `SELECT partner_id FROM ${kind.table} WHERE id = $1`,
        [res.body.id],
      );
      // A free-text party must not leave an id pointing at a row it never named.
      expect(rows[0].partner_id).toBeNull();
    });

    it('rejects an unknown field, proving the DTO really declares partnerName', async () => {
      // The global ValidationPipe runs forbidNonWhitelisted, so this 400 is what
      // tells us the previous tests passed because the field is declared rather
      // than because unknown fields are silently dropped.
      await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.body({ partnerType: 'OTHER', partnerNmae: 'typo' }))
        .expect(400);
    });
  });
});
