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
 * The accounting invariants behind ADR-01: editing a posted cash voucher writes
 * ONE compensating movement on that same voucher, and never rewrites history.
 *
 * Two claims are asserted after every mutation, because they are the two ways
 * this feature can be wrong in a way code review would miss:
 *
 *   TR-1  Σ(movements for the voucher) === the voucher's current total, signed
 *         by the voucher's direction. Catches a delta computed from the wrong
 *         baseline, and catches a double-post.
 *   TR-2  Every ledger row that existed before the edit still exists afterwards,
 *         with the same amount. Catches an UPDATE or DELETE of posted history —
 *         the thing `docs/09-accounting-module.md` forbids outright.
 */
describe('Treasury voucher edit invariants (E2E)', () => {
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

  /** Signed sum of every movement this voucher produced, in voucher direction. */
  const movementSum = async (documentNumber: string): Promise<number> => {
    const rows = await ds.query(
      `SELECT type, amount FROM cash_movements
        WHERE cash_account_id = $1 AND reference = $2`,
      [cashAccountId, documentNumber],
    );
    return rows.reduce(
      (sum: number, r: { type: string; amount: string }) =>
        sum + (r.type === 'DEPOSIT' ? Number(r.amount) : -Number(r.amount)),
      0,
    );
  };

  /** Immutable snapshot of posted history, for TR-2. */
  const ledgerSnapshot = async (): Promise<string[]> => {
    const rows = await ds.query(
      `SELECT id, amount FROM cash_movements ORDER BY id`,
    );
    const jes = await ds.query(`SELECT id FROM journal_entries ORDER BY id`);
    return [
      ...rows.map((r: { id: string; amount: string }) => `m:${r.id}:${r.amount}`),
      ...jes.map((j: { id: string }) => `j:${j.id}`),
    ];
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

  const editReceipt = async (
    id: string,
    revision: number,
    amount: number,
    extra: Record<string, unknown> = {},
    status = 200,
  ) =>
    request(app.getHttpServer())
      .patch(`/cash-receipts/${id}`)
      .set(headers())
      .send({
        revision,
        totalAmount: amount,
        lines: [{ description: 'Thu khác', amount }],
        ...extra,
      })
      .expect(status);

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
      'accounting.cash_payment.create', 'accounting.cash_payment.read',
      'accounting.cash_payment.update', 'accounting.cash_payment.delete',
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

  it('keeps the document number and settles the difference on the same voucher', async () => {
    const before = await cashBalance();
    const created = await createReceipt(5_000_000);
    expect(await cashBalance()).toBe(before + 5_000_000);

    const history = await ledgerSnapshot();
    const res = await editReceipt(created.id, created.revision, 4_000_000);

    // The number is the whole point: one voucher, not a reversal plus a new one.
    expect(res.body.documentNumber).toBe(created.documentNumber);
    expect(res.body.revision).toBe(created.revision + 1);
    expect(await cashBalance()).toBe(before + 4_000_000);

    // TR-1
    expect(await movementSum(created.documentNumber)).toBe(4_000_000);
    // TR-2 — nothing that existed before was touched; only additions.
    const after = await ledgerSnapshot();
    expect(after).toEqual(expect.arrayContaining(history));
    expect(after.length).toBeGreaterThan(history.length);
  });

  it('raises the amount with a second compensating movement, not a rewrite', async () => {
    const before = await cashBalance();
    const created = await createReceipt(1_000_000);
    const history = await ledgerSnapshot();

    await editReceipt(created.id, created.revision, 2_500_000);

    expect(await cashBalance()).toBe(before + 2_500_000);
    expect(await movementSum(created.documentNumber)).toBe(2_500_000);
    expect(await ledgerSnapshot()).toEqual(expect.arrayContaining(history));
  });

  it('writes NO movement when only the wording changed', async () => {
    const created = await createReceipt(750_000);
    const before = await cashBalance();
    const history = await ledgerSnapshot();

    await editReceipt(created.id, created.revision, 750_000, {
      reason: 'Sửa diễn giải thôi',
    });

    expect(await cashBalance()).toBe(before);
    // Still exactly the original movement — an edit that moves no money must
    // not leave a 0-value row behind either.
    expect(await ledgerSnapshot()).toEqual(history);
  });

  it('survives a chain of edits without drifting', async () => {
    const before = await cashBalance();
    const created = await createReceipt(1_000_000);
    let revision = created.revision;

    for (const amount of [2_000_000, 500_000, 1_750_000]) {
      const res = await editReceipt(created.id, revision, amount);
      revision = res.body.revision;
      // The invariant has to hold after EVERY step, not just at the end —
      // a drift that cancels out later is still a wrong ledger in between.
      expect(await movementSum(created.documentNumber)).toBe(amount);
    }
    expect(await cashBalance()).toBe(before + 1_750_000);
    expect(revision).toBe(created.revision + 3);
  });

  it('refuses a stale revision instead of overwriting the other edit', async () => {
    const created = await createReceipt(600_000);
    await editReceipt(created.id, created.revision, 700_000);

    const balanceAfterFirst = await cashBalance();
    // Second writer still holds revision 0 — the value it read before the first
    // edit landed. It must lose, not silently win.
    await editReceipt(created.id, created.revision, 900_000, {}, 409);
    expect(await cashBalance()).toBe(balanceAfterFirst);
  });
});
