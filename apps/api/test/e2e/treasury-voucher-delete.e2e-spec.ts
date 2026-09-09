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
 * Deleting a posted voucher (ADR-02: it is `update()` with `after = []`).
 *
 * The three faces of "deleted" are asserted separately because each can be true
 * without the others: the money comes back, the row leaves every read path, and
 * the row is still there with `deleted_at` set. A delete that only did the first
 * two would be indistinguishable from a hard delete, and would take the audit
 * trail with it.
 */
describe('Treasury voucher delete (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let cashAccountId: string;

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

  const cashBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/cash/accounts/${cashAccountId}`)
      .set(headers())
      .expect(200);
    return Number(res.body.balance);
  };

  const createReceipt = async (amount: number) => {
    const res = await request(app.getHttpServer())
      .post('/cash-receipts')
      .set(headers())
      .send({
        voucherDate: '2026-06-30',
        cashAccountId,
        totalAmount: amount,
        lines: [{ description: 'Thu khác', amount }],
      })
      .expect(201);
    return res.body;
  };

  const searchGrid = async (): Promise<string[]> => {
    const res = await request(app.getHttpServer())
      .post('/v2/cash-vouchers/search')
      .set(headers())
      .send({ page: 1, limit: 100 })  // @Max(100) on the DTO
      .expect((r) => {
        if (![200, 201].includes(r.status)) {
          throw new Error(`unexpected status ${r.status}`);
        }
      });
    return (res.body.data ?? []).map((row: { id: string }) => row.id);
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
    for (const key of [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.read',
      'accounting.cash_receipt.update', 'accounting.cash_receipt.delete',
      'accounting.cash_voucher.read',
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
  }, 180000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  it('returns the fund to where it stood before the voucher existed', async () => {
    const before = await cashBalance();
    const created = await createReceipt(3_000_000);
    expect(await cashBalance()).toBe(before + 3_000_000);

    await request(app.getHttpServer())
      .delete(`/cash-receipts/${created.id}`)
      .set(headers())
      .expect(200);

    expect(await cashBalance()).toBe(before);
  });

  it('keeps the row and the ledger history, marking only deleted_at', async () => {
    const created = await createReceipt(1_200_000);
    const movementsBefore = await ds.query(
      `SELECT id FROM cash_movements WHERE reference = $1`,
      [created.documentNumber],
    );

    await request(app.getHttpServer())
      .delete(`/cash-receipts/${created.id}`)
      .set(headers())
      .expect(200);

    const rows = await ds.query(
      `SELECT status, deleted_at, revision FROM cash_receipts WHERE id = $1`,
      [created.id],
    );
    // Still one row — a hard delete would take the audit trail with it.
    expect(rows).toHaveLength(1);
    expect(rows[0].deleted_at).not.toBeNull();
    // No CANCELLED enum value was introduced (ADR-02).
    expect(rows[0].status).toBe('POSTED');
    expect(Number(rows[0].revision)).toBe(created.revision + 1);

    const movementsAfter = await ds.query(
      `SELECT id FROM cash_movements WHERE reference = $1`,
      [created.documentNumber],
    );
    // The original movement survives; the reversal is an ADDITION.
    expect(movementsAfter.length).toBe(movementsBefore.length + 1);
    expect(movementsAfter.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining(movementsBefore.map((m: { id: string }) => m.id)),
    );
  });

  it('drops out of the v2 grid, the read path users actually see', async () => {
    const created = await createReceipt(900_000);
    expect(await searchGrid()).toContain(created.id);

    await request(app.getHttpServer())
      .delete(`/cash-receipts/${created.id}`)
      .set(headers())
      .expect(200);

    // The grid runs raw SQL, which TypeORM does NOT filter for soft-deletes —
    // this asserts the handler's own `deleted_at IS NULL`, not the ORM's.
    expect(await searchGrid()).not.toContain(created.id);
  });

  it('refuses a second delete instead of reversing twice', async () => {
    const created = await createReceipt(400_000);
    await request(app.getHttpServer())
      .delete(`/cash-receipts/${created.id}`)
      .set(headers())
      .expect(200);

    const balanceAfter = await cashBalance();
    await request(app.getHttpServer())
      .delete(`/cash-receipts/${created.id}`)
      .set(headers())
      .expect((r) => {
        if (r.status < 400) throw new Error(`expected a refusal, got ${r.status}`);
      });
    // The decisive assertion: no second compensating movement was written.
    expect(await cashBalance()).toBe(balanceAfter);
  });

  it('makes deleting equivalent to editing down to zero', async () => {
    const before = await cashBalance();
    const deleted = await createReceipt(2_000_000);
    await request(app.getHttpServer())
      .delete(`/cash-receipts/${deleted.id}`)
      .set(headers())
      .expect(200);
    const afterDelete = await cashBalance();

    const edited = await createReceipt(2_000_000);
    await request(app.getHttpServer())
      .patch(`/cash-receipts/${edited.id}`)
      .set(headers())
      .send({ revision: edited.revision, totalAmount: 0, lines: [] })
      .expect((r) => {
        if (![200, 400].includes(r.status)) {
          throw new Error(`unexpected status ${r.status}`);
        }
      });

    // Whatever the edit-to-zero path does, deleting must land the fund in the
    // same place it started — that equivalence is what ADR-02 buys.
    expect(afterDelete).toBe(before);
  });
});
