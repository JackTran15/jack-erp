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
 * The HTTP -> DTO -> column -> read-back chain for "Địa chỉ" on cash vouchers
 * (ADR-03), plus a deposit-voucher regression case proving the two families
 * still behave the same way on the paths ADR-03 copied from.
 *
 * `treasury-voucher-party.e2e-spec.ts` (2026090701) covers the same seeding
 * shape for `partnerName`; this suite follows its structure but only needs the
 * cash side plus one deposit side regression, per T-02-04's scope.
 *
 * Deliberately NOT covered here: sending `address: ''` to a bank voucher. Per
 * A-R6, `bank-receipts.service.ts` / `bank-payments.service.ts` apply
 * `dto.address ?? receipt.partnerAddressSnapshot` with no `.trim()` and no
 * `|| null`, so an empty string is stored as `''` there, not `NULL` as it is
 * on the cash side after this ticket. That divergence is known and
 * deliberately unfixed (out of scope for this feature) — asserting NULL for
 * bank would fail for a reason this ticket does not own.
 */
describe('Treasury voucher address (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let depositAccountId: string;
  let customerId: string;
  const customerName = 'KH002 - Cong ty Dia Chi';
  const customerAddress = '456 Nguyễn Huệ';

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

    // A catalogue customer with a DIFFERENT address than what the voucher will
    // type by hand — this is what AC-08 needs to prove the typed value wins.
    customerId = randomUUID();
    await ds.query(
      `INSERT INTO customers (id, organization_id, branch_id, name, code, address, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'KH002', $5, 'ACTIVE', $6, NOW(), NOW())`,
      [customerId, seed.organizationId, seed.branchId, customerName, customerAddress, seed.userId],
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

  const cashKinds = (): Kind[] => [
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
  ];

  describe.each(cashKinds())('$label — address is saved (AC-07)', (kind) => {
    it('POST with address -> 201, and GET :id reads back the exact string', async () => {
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(
          kind.body({
            partnerType: 'OTHER',
            partnerName: 'Nguyễn Văn Ba',
            address: '123 Lê Lợi, Q1',
          }),
        )
        .expect(201);

      expect(created.body.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');

      const fetched = await request(app.getHttpServer())
        .get(`${kind.path}/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');
    });
  });

  describe('cash receipt — typed address beats the catalogue address (AC-08)', () => {
    it('freezes the hand-typed address, not the customer record address', async () => {
      const created = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-06-30',
          cashAccountId,
          totalAmount: 100000,
          lines: [{ description: 'Thu khác', amount: 100000 }],
          partnerType: 'CUSTOMER',
          partnerId: customerId,
          address: `${customerAddress}, lầu 3`,
        })
        .expect(201);

      expect(created.body.partnerAddressSnapshot).toBe(`${customerAddress}, lầu 3`);
      expect(created.body.partnerAddressSnapshot).not.toBe(customerAddress);

      const fetched = await request(app.getHttpServer())
        .get(`/cash-receipts/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBe(`${customerAddress}, lầu 3`);
    });
  });

  describe('cash receipt — editing a posted voucher (AC-09)', () => {
    it('PATCH changing only address -> 200, revision +1, totalAmount unchanged', async () => {
      const created = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-06-30',
          cashAccountId,
          totalAmount: 100000,
          lines: [{ description: 'Thu khác', amount: 100000 }],
          partnerType: 'OTHER',
          partnerName: 'Đối tượng gõ tay',
          address: 'Địa chỉ ban đầu',
        })
        .expect(201);
      expect(created.body.revision).toBe(0);

      const updated = await request(app.getHttpServer())
        .patch(`/cash-receipts/${created.body.id}`)
        .set(headers())
        .send({
          revision: created.body.revision,
          address: 'Địa chỉ mới, lầu 3',
        })
        .expect(200);

      expect(updated.body.revision).toBe(1);
      expect(Number(updated.body.totalAmount)).toBe(100000);
      expect(updated.body.partnerAddressSnapshot).toBe('Địa chỉ mới, lầu 3');

      const fetched = await request(app.getHttpServer())
        .get(`/cash-receipts/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBe('Địa chỉ mới, lầu 3');
      expect(Number(fetched.body.totalAmount)).toBe(100000);
    });

    it('PATCH with address: "" clears the snapshot to NULL, read back as empty', async () => {
      const created = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-06-30',
          cashAccountId,
          totalAmount: 100000,
          lines: [{ description: 'Thu khác', amount: 100000 }],
          partnerType: 'OTHER',
          partnerName: 'Đối tượng gõ tay',
          address: 'Sẽ bị xoá',
        })
        .expect(201);

      await request(app.getHttpServer())
        .patch(`/cash-receipts/${created.body.id}`)
        .set(headers())
        .send({ revision: created.body.revision, address: '' })
        .expect(200);

      const fetched = await request(app.getHttpServer())
        .get(`/cash-receipts/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBeNull();
    });
  });

  describe('bank receipt — deposit voucher regression (unchanged behaviour)', () => {
    it('saves a hand-typed address the same way a cash receipt does', async () => {
      const created = await request(app.getHttpServer())
        .post('/bank-receipts')
        .set(headers())
        .send({
          docDate: '2026-06-30',
          depositAccountId,
          totalAmount: 100000,
          lines: [{ description: 'Thu khác', amount: 100000 }],
          partnerType: 'OTHER',
          partnerName: 'Nguyễn Văn Ba',
          address: '123 Lê Lợi, Q1',
        })
        .expect(201);

      expect(created.body.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');

      const fetched = await request(app.getHttpServer())
        .get(`/bank-receipts/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBe('123 Lê Lợi, Q1');
    });

    it('lets a hand-typed address beat the catalogue address, same as a cash receipt', async () => {
      const created = await request(app.getHttpServer())
        .post('/bank-receipts')
        .set(headers())
        .send({
          docDate: '2026-06-30',
          depositAccountId,
          totalAmount: 100000,
          lines: [{ description: 'Thu khác', amount: 100000 }],
          partnerType: 'CUSTOMER',
          partnerId: customerId,
          address: `${customerAddress}, lầu 3`,
        })
        .expect(201);

      expect(created.body.partnerAddressSnapshot).toBe(`${customerAddress}, lầu 3`);
      expect(created.body.partnerAddressSnapshot).not.toBe(customerAddress);

      const fetched = await request(app.getHttpServer())
        .get(`/bank-receipts/${created.body.id}`)
        .set(headers())
        .expect(200);

      expect(fetched.body.partnerAddressSnapshot).toBe(`${customerAddress}, lầu 3`);
    });
  });
});
