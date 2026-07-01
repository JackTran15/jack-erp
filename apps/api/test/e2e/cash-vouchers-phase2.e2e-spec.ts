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
import { CashVoucherCategorySeederService } from '../../src/modules/accounting/cash-vouchers/cash-voucher-categories/cash-voucher-category.seeder';
import { RbacService } from '../../src/modules/rbac/rbac.service';
import { OutboxRelayService } from '../../src/modules/events/outbox/outbox-relay.service';

/**
 * Phase 2 auto-create flow (A-revised + Transactional Outbox), exercised through
 * the Expense → Phiếu chi path (no inventory seeding needed):
 *   post expense (CASH) → recordMovement(WITHDRAWAL) + JE in source TX + outbox row
 *   → relay publishes → ExpenseCashConsumer creates Phiếu chi (links movement+JE)
 *   → ExpenseVoucherLinkConsumer back-fills expenses.cash_payment_id.
 *
 * The relay auto-interval is disabled; we trigger `pollOnce()` deterministically.
 */
describe('Cash Vouchers Phase 2 — Expense auto-create (E2E)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let seed: SeedResult;
  let relay: OutboxRelayService;
  let cashAccountId: string;
  let expenseAccountId: string; // 642

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

  const getBalance = async (): Promise<number> => {
    const res = await request(app.getHttpServer())
      .get(`/cash/accounts/${cashAccountId}`)
      .set(headers())
      .expect(200);
    return Number(res.body.balance);
  };

  const waitFor = async <T>(
    fn: () => Promise<T | null | undefined>,
    timeoutMs = 15000,
  ): Promise<T> => {
    const start = Date.now();
    // Drive the relay each tick so the outbox row gets published promptly.
    while (Date.now() - start < timeoutMs) {
      await relay.pollOnce().catch(() => undefined);
      const r = await fn();
      if (r) return r;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error('timeout waiting for eventual consistency');
  };

  beforeAll(async () => {
    app = await createTestApp();
    await resetDatabase(app);
    seed = await seedBaseData(app);
    ds = app.get(DataSource);
    relay = app.get(OutboxRelayService);

    await app.get(CoaSeederService).seedForOrganization(seed.organizationId, seed.userId);
    await app
      .get(CashVoucherCategorySeederService)
      .seedForOrganization(seed.organizationId, seed.userId);

    const roleRows = await ds.query(
      `SELECT id FROM roles WHERE organization_id = $1 AND name = 'admin' LIMIT 1`,
      [seed.organizationId],
    );
    const roleId = roleRows[0].id;
    const perms = [
      'accounting.cash_receipt.create', 'accounting.cash_receipt.post',
      'accounting.cash.create', 'accounting.cash.read',
      'accounting.expenses.create', 'accounting.expenses.read', 'accounting.expenses.update',
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
    expenseAccountId = await accountByCode('642');

    const accRes = await request(app.getHttpServer())
      .post('/cash/accounts')
      .set(headers())
      .send({ name: 'Quỹ E2E P2', type: 'REGISTER', accountId: cashGlId, balance: 0 })
      .expect(201);
    cashAccountId = accRes.body.id;

    // Top up the register (auto-posted) so the expense can be paid in cash.
    await request(app.getHttpServer())
      .post('/cash-receipts')
      .set(headers())
      .send({
        voucherDate: '2026-05-21',
        cashAccountId,
        contraAccountId: await accountByCode('511'),
        totalAmount: 1000000,
        lines: [{ description: 'Nạp quỹ', amount: 1000000 }],
      })
      .expect(201);
  }, 120000);

  afterAll(async () => {
    await Promise.race([
      app.close(),
      new Promise((resolve) => setTimeout(resolve, 15000)),
    ]);
  }, 60000);

  it('expense CASH post: synchronous JE + balance, then async Phiếu chi + link-back', async () => {
    const before = await getBalance();

    const create = await request(app.getHttpServer())
      .post('/expenses')
      .set(headers())
      .send({
        description: 'Chi phí taxi',
        amount: 500,
        accountId: expenseAccountId,
        paymentMethod: 'CASH',
        cashAccountId,
      })
      .expect(201);
    const expenseId = create.body.id;

    const posted = await request(app.getHttpServer())
      .post(`/expenses/${expenseId}/post`)
      .set(headers())
      .expect(201);

    // Synchronous: JE created in the source TX, balance reduced immediately.
    expect(posted.body.journalEntryId).toBeTruthy();
    expect(await getBalance()).toBe(before - 500);

    // Outbox row enqueued in the same TX (relay disabled → still pending).
    const outboxRows = await ds.query(
      `SELECT * FROM outbox_messages WHERE topic = $1`,
      ['erp.cash.voucher.needed.expense'],
    );
    expect(outboxRows.length).toBeGreaterThanOrEqual(1);

    // Async: relay publishes → ExpenseCashConsumer creates the Phiếu chi.
    const payment = await waitFor(async () => {
      const rows = await ds.query(
        `SELECT * FROM cash_payments WHERE reference_type = 'EXPENSE' AND reference_id = $1 LIMIT 1`,
        [expenseId],
      );
      return rows[0] ?? null;
    });
    expect(payment.purpose).toBe('EXPENSE');
    expect(payment.status).toBe('POSTED');
    // One shared journal entry across source + voucher.
    expect(payment.journal_entry_id).toBe(posted.body.journalEntryId);

    // Async: link-back consumer back-fills expenses.cash_payment_id.
    const linked = await waitFor(async () => {
      const rows = await ds.query(
        `SELECT cash_payment_id FROM expenses WHERE id = $1`,
        [expenseId],
      );
      return rows[0]?.cash_payment_id ?? null;
    });
    expect(linked).toBe(payment.id);
  }, 60000);

  it('expense CASH post with insufficient balance → 400, no movement/outbox row', async () => {
    const before = await getBalance();
    const create = await request(app.getHttpServer())
      .post('/expenses')
      .set(headers())
      .send({
        description: 'Chi vượt quỹ',
        amount: 999999999,
        accountId: expenseAccountId,
        paymentMethod: 'CASH',
        cashAccountId,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/expenses/${create.body.id}/post`)
      .set(headers())
      .expect(400);

    expect(await getBalance()).toBe(before);
    const rows = await ds.query(
      `SELECT * FROM outbox_messages WHERE payload->'payload'->>'sourceId' = $1`,
      [create.body.id],
    );
    expect(rows.length).toBe(0);
  }, 60000);
});
