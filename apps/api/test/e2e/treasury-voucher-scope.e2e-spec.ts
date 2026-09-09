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
 * The three ways opening up edit/delete could leak, none of which show up by
 * clicking around: a saga-produced voucher edited through the API behind the
 * greyed-out button, another organisation's voucher, and an account without the
 * permission.
 *
 * The saga cases matter most. `assertEditable` keys on `reference_type ===
 * MANUAL` (ADR-05) precisely because `purpose` cannot express "a human typed
 * this" — so each non-MANUAL reference type is asserted individually rather than
 * trusting one representative value.
 */
describe('Treasury voucher edit scope (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;
  let contraAccountId: string;
  let roleId: string;

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

  /**
   * Insert a POSTED receipt directly, carrying whatever reference_type the case
   * needs. Going through the real saga would prove the same guard at ten times
   * the setup cost — the guard reads the column, not the flow that wrote it.
   */
  const insertVoucher = async (opts: {
    referenceType: string;
    organizationId?: string;
    branchId?: string;
  }): Promise<string> => {
    const id = randomUUID();
    await ds.query(
      `INSERT INTO cash_receipts
         (id, organization_id, branch_id, document_number, voucher_date, purpose,
          status, reference_type, cash_account_id, contra_account_id, total_amount,
          revision, created_by, created_at, updated_at)
       VALUES ($1, $2, $3, $4, '2026-06-30', 'OTHER', 'POSTED', $5, $6, $7, 100000, 0,
               $8, NOW(), NOW())`,
      [
        id,
        opts.organizationId ?? seed.organizationId,
        opts.branchId ?? seed.branchId,
        `PT-SCOPE-${id.slice(0, 8)}`,
        opts.referenceType,
        cashAccountId,
        contraAccountId,
        seed.userId,
      ],
    );
    return id;
  };

  const patch = (id: string) =>
    request(app.getHttpServer())
      .patch(`/cash-receipts/${id}`)
      .set(headers())
      .send({ revision: 0, totalAmount: 100000, lines: [{ description: 'x', amount: 100000 }] });

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
    roleId = roleRows[0].id;
    for (const key of [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_receipt.update', 'accounting.cash_receipt.delete',
    ]) {
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
    contraAccountId = await accountByCode('511');
  }, 180000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  describe('vouchers a machine wrote', () => {
    // Every non-MANUAL reference type the cash receipt side can carry.
    it.each([
      ['INVOICE'],
      ['INVOICE_DEBT'],
      ['RECEIVABLE'],
      ['REVERSAL'],
      ['FUND_SWAP'],
      ['TRANSFER'],
    ])('refuses to edit a %s voucher', async (referenceType) => {
      const id = await insertVoucher({ referenceType });
      await patch(id).expect(400);
    });

    it.each([['INVOICE_DEBT'], ['REVERSAL']])(
      'refuses to delete a %s voucher',
      async (referenceType) => {
        const id = await insertVoucher({ referenceType });
        await request(app.getHttpServer())
          .delete(`/cash-receipts/${id}`)
          .set(headers())
          .expect(400);
      },
    );

    it('still allows a MANUAL voucher, proving the refusals are about the type', async () => {
      const id = await insertVoucher({ referenceType: 'MANUAL' });
      await patch(id).expect(200);
    });
  });

  describe('tenant isolation', () => {
    it('reports another organisation voucher as not found, not forbidden', async () => {
      // No organizations row is created: cash_receipts.organization_id carries no
      // FK, and the scoping this asserts is the service's WHERE clause, not a
      // database constraint. Inventing a tenant row would test the fixture.
      const id = await insertVoucher({
        referenceType: 'MANUAL',
        organizationId: randomUUID(),
      });
      // 404 rather than 403: a cross-tenant probe must not confirm the row exists.
      await patch(id).expect(404);
    });
  });

  describe('permissions', () => {
    it('refuses the edit when the role loses cash_receipt.update', async () => {
      const id = await insertVoucher({ referenceType: 'MANUAL' });
      await ds.query(
        `DELETE FROM role_permissions
          WHERE role_id = $1
            AND permission_id = (SELECT id FROM permissions WHERE key = $2)`,
        [roleId, 'accounting.cash_receipt.update'],
      );
      await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);
      try {
        // The capability rides on the permission that already existed — no new
        // key was minted for "edit a posted voucher" (A-09).
        await patch(id).expect(403);
      } finally {
        await ds.query(
          `INSERT INTO role_permissions (id, role_id, permission_id)
           SELECT gen_random_uuid(), $1::uuid, p.id FROM permissions p WHERE p.key = $2
           ON CONFLICT DO NOTHING`,
          [roleId, 'accounting.cash_receipt.update'],
        );
        await app.get(RbacService).invalidateOrgPermissions(seed.organizationId);
      }
    });
  });
});
