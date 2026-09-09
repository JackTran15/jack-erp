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
 * The full HTTP -> service -> grid-column chain for a hand-typed "Đối tượng",
 * proved across all four treasury voucher types.
 *
 * `treasury-voucher-party.e2e-spec.ts` (2026090701) already covers the plain
 * free-text create path in isolation. This suite adds what that one does not:
 *   - a catalogue partner whose name is overridden by hand keeps its
 *     partner_id (AC-03);
 *   - editing a voucher across the catalogue/free-text boundary clears the
 *     shape it left behind, in BOTH directions, not just one;
 *   - the v2 grid's counterparty column actually surfaces the hand-typed name
 *     when the payer/payee field is left blank (AC-05) — the one case where
 *     also filling payer/payee would make the assertion pass for the wrong
 *     reason, because the column falls back through payer/payee first.
 *
 * One shared `kinds()` table drives every case, same reasoning as the sibling
 * suite: the cash and deposit sides are parallel implementations (parallel
 * enums, parallel services), so a per-type test would let a fix on one side
 * and a miss on its twin pass silently (A-R5).
 */
describe('Treasury voucher free-text party — full chain (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let depositAccountId: string;
  let customerId: string;
  const customerName = 'KH001 - Cong ty A';

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

    // A real catalogue customer for AC-03 and the shape-switching cases: picked
    // via partnerId the way the lookup dialog would, then its name overridden
    // by hand on the voucher.
    customerId = randomUUID();
    await ds.query(
      `INSERT INTO customers (id, organization_id, branch_id, name, code, status, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'KH001', 'ACTIVE', $5, NOW(), NOW())`,
      [customerId, seed.organizationId, seed.branchId, customerName, seed.userId],
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

  describe.each(kinds())('$label — free-text party (AC-01, AC-06)', (kind) => {
    it('saves partnerName with no partnerId as OTHER, id NULL, exact snapshot', async () => {
      const res = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.body({ partnerType: 'OTHER', partnerName: 'Nguyễn Văn Ba' }))
        .expect(201);

      const rows = await ds.query(
        `SELECT partner_type, partner_id, partner_name_snapshot
           FROM ${kind.table} WHERE id = $1`,
        [res.body.id],
      );
      expect(rows[0].partner_type).toBe('OTHER');
      expect(rows[0].partner_id).toBeNull();
      expect(rows[0].partner_name_snapshot).toBe('Nguyễn Văn Ba');
    });
  });

  describe.each(kinds())(
    '$label — catalogue partner overridden by a typed name (AC-03)',
    (kind) => {
      it('keeps partnerId and freezes the typed name onto the snapshot', async () => {
        const res = await request(app.getHttpServer())
          .post(kind.path)
          .set(headers())
          .send(
            kind.body({
              partnerType: 'CUSTOMER',
              partnerId: customerId,
              partnerName: `${customerName} — CN Bình Tân`,
            }),
          )
          .expect(201);

        const rows = await ds.query(
          `SELECT partner_type, partner_id, partner_name_snapshot
             FROM ${kind.table} WHERE id = $1`,
          [res.body.id],
        );
        expect(rows[0].partner_type).toBe('CUSTOMER');
        expect(rows[0].partner_id).toBe(customerId);
        expect(rows[0].partner_name_snapshot).toBe(`${customerName} — CN Bình Tân`);
      });
    },
  );

  describe.each(kinds())('$label — switching shapes on edit', (kind) => {
    it('clears the old shape completely in both directions', async () => {
      // Start from a catalogue partner, no typed override.
      const created = await request(app.getHttpServer())
        .post(kind.path)
        .set(headers())
        .send(kind.body({ partnerType: 'CUSTOMER', partnerId: customerId }))
        .expect(201);

      const beforeRows = await ds.query(
        `SELECT partner_id, partner_name_snapshot FROM ${kind.table} WHERE id = $1`,
        [created.body.id],
      );
      expect(beforeRows[0].partner_id).toBe(customerId);
      expect(beforeRows[0].partner_name_snapshot).toBe(customerName);

      // Switch to a hand-typed name: partner_id and the address snapshot must
      // be cleared to NULL, not merely left unreferenced.
      const toFreeText = await request(app.getHttpServer())
        .patch(`${kind.path}/${created.body.id}`)
        .set(headers())
        .send({
          revision: created.body.revision,
          partnerType: 'OTHER',
          partnerName: 'Đối tượng gõ tay',
        })
        .expect(200);

      const freeTextRows = await ds.query(
        `SELECT partner_type, partner_id, partner_name_snapshot, partner_address_snapshot
           FROM ${kind.table} WHERE id = $1`,
        [created.body.id],
      );
      expect(freeTextRows[0].partner_type).toBe('OTHER');
      expect(freeTextRows[0].partner_id).toBeNull();
      expect(freeTextRows[0].partner_name_snapshot).toBe('Đối tượng gõ tay');
      expect(freeTextRows[0].partner_address_snapshot).toBeNull();

      // Switch back to the catalogue: partner_id returns, and the hand-typed
      // name does not linger — the catalogue name wins because this PATCH
      // types no override.
      await request(app.getHttpServer())
        .patch(`${kind.path}/${created.body.id}`)
        .set(headers())
        .send({
          revision: toFreeText.body.revision,
          partnerType: 'CUSTOMER',
          partnerId: customerId,
        })
        .expect(200);

      const catalogRows = await ds.query(
        `SELECT partner_type, partner_id, partner_name_snapshot
           FROM ${kind.table} WHERE id = $1`,
        [created.body.id],
      );
      expect(catalogRows[0].partner_type).toBe('CUSTOMER');
      expect(catalogRows[0].partner_id).toBe(customerId);
      expect(catalogRows[0].partner_name_snapshot).toBe(customerName);
    });
  });

  describe('grid counterparty column falls back to the typed name (AC-05)', () => {
    /**
     * The trap this ticket calls out by name: filling payer/payee name TOO
     * would make the grid fall back to it (the COALESCE checks payer/payee
     * before partner_name_snapshot), so the assertion below would pass even
     * if the snapshot column were wrong. Each case leaves that field empty on
     * purpose.
     */
    it('cash payment: shows partnerName when payeeName is left blank', async () => {
      const created = await request(app.getHttpServer())
        .post('/cash-payments')
        .set(headers())
        .send({
          voucherDate: '2026-06-30',
          cashAccountId,
          totalAmount: 77000,
          lines: [{ description: 'Chi khác', amount: 77000 }],
          partnerType: 'OTHER',
          partnerName: 'Nguyễn Văn Ba',
        })
        .expect(201);

      const search = await request(app.getHttpServer())
        .post('/v2/cash-vouchers/search')
        .set(headers())
        .send({
          page: 1,
          limit: 20,
          documentNumber: { operator: '=', value: created.body.documentNumber },
        })
        .expect((r) => {
          if (![200, 201].includes(r.status)) {
            throw new Error(`unexpected status ${r.status}`);
          }
        });

      expect(search.body.data).toHaveLength(1);
      expect(search.body.data[0].counterparty).toBe('Nguyễn Văn Ba');
    });

    it('cash receipt: shows partnerName when payerName is left blank', async () => {
      const created = await request(app.getHttpServer())
        .post('/cash-receipts')
        .set(headers())
        .send({
          voucherDate: '2026-06-30',
          cashAccountId,
          totalAmount: 88000,
          lines: [{ description: 'Thu khác', amount: 88000 }],
          partnerType: 'OTHER',
          partnerName: 'Trần Thị Bốn',
        })
        .expect(201);

      const search = await request(app.getHttpServer())
        .post('/v2/cash-vouchers/search')
        .set(headers())
        .send({
          page: 1,
          limit: 20,
          documentNumber: { operator: '=', value: created.body.documentNumber },
        })
        .expect((r) => {
          if (![200, 201].includes(r.status)) {
            throw new Error(`unexpected status ${r.status}`);
          }
        });

      expect(search.body.data).toHaveLength(1);
      expect(search.body.data[0].counterparty).toBe('Trần Thị Bốn');
    });
  });
});
