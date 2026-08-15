import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  buildCheckoutSagaFixture,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';

/**
 * UOW-03 — the Phiếu thu checkout v2 never used to write, and the four identity fields it
 * has to carry (AC-01, AC-09, AC-10, AC-12).
 *
 * Lives in e2e rather than in `post-cash.step.spec.ts` because the three things most likely
 * to be wrong are invisible to a mocked manager: whether the six values actually reach their
 * columns, whether a second journal entry sneaks in, and whether the numbering rule exists at
 * all. The last one is not hypothetical — running the suite is how ADR-06 was found.
 */
describe('Checkout Saga v2 — Phiếu thu party fields (E2E)', () => {
  let fx: CheckoutSagaFixture;
  let depositAccountId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();

    // A bank_transfer route with a backing deposit fund, same shape as checkout-saga.e2e —
    // needed for AC-13, the Phiếu thu tiền gửi UOW-04 introduced.
    const bankCoa = await fx.ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121-PARTY', 'Bank E2E Party', 'ASSET', true, $2, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.userId],
    );
    const bank = await fx.ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'PARTY-VCB', 'Party Bank', true, $2, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.userId],
    );
    const deposit = await fx.ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Party Deposit', 'DEP-PARTY', 'ACC-PARTY', 'ERP Test',
               $3, 'BANK_ACCOUNT', $4, 0, '2026-01-01', 0, false, false, 'ACTIVE', $5, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.branchId, bank[0].id, bankCoa[0].id, fx.seed.userId],
    );
    depositAccountId = deposit[0].id;
    await fx.ds.query(
      `INSERT INTO payment_accounts
         (id, organization_id, branch_id, payment_method, account_id, deposit_account_id, is_active, sort_order, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 'bank_transfer', $2, $3, true, 0, $4, NOW(), NOW())`,
      [fx.seed.organizationId, bankCoa[0].id, depositAccountId, fx.seed.userId],
    );
  }, 300_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const createDraft = async (customerId?: string): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        ...(customerId ? { customerId } : {}),
        items: [
          {
            itemId: fx.itemId,
            locationId: fx.locationId,
            itemCode: 'CKO-ITEM-1',
            itemName: 'Item',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      })
      .expect(201);
    return res.body.id as string;
  };

  const checkout = (invoiceId: string, idempotencyKey?: string) => {
    const req = request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers());
    if (idempotencyKey) req.set('X-Idempotency-Key', idempotencyKey);
    return req.send({
      invoiceId,
      payments: [{ paymentMethod: 'cash', amount: 100000 }],
    });
  };

  const receiptsFor = (invoiceId: string) =>
    fx.ds.query(
      `SELECT * FROM cash_receipts WHERE reference_id = $1 AND reference_type = 'INVOICE'`,
      [invoiceId],
    );

  it('AC-09/AC-01: one POSTED receipt naming the customer, address and staff member', async () => {
    // Give the branch an address so the fallback in AC-03 has something to fall back to, and
    // the customer one of their own so this test proves the customer wins.
    await fx.ds.query(`UPDATE branches SET address = $1 WHERE id = $2`, [
      '45 Nguyễn Huệ',
      fx.seed.branchId,
    ]);
    await fx.ds.query(`UPDATE customers SET address = $1 WHERE id = $2`, [
      '12 Lê Lợi',
      fx.customerId,
    ]);

    const invoiceId = await createDraft(fx.customerId);
    const jeBefore = await fx.ds.query(
      `SELECT count(*)::int AS c FROM journal_entries`,
    );

    await checkout(invoiceId).expect(201);

    const receipts = await receiptsFor(invoiceId);
    expect(receipts).toHaveLength(1);
    const receipt = receipts[0];

    expect(receipt.status).toBe('POSTED');
    expect(Number(receipt.total_amount)).toBe(100000);
    expect(receipt.document_number).toMatch(/^PT\d{6}$/);
    expect(receipt.partner_type).toBe('CUSTOMER');
    expect(receipt.partner_id).toBe(fx.customerId);
    expect(receipt.partner_name_snapshot).toBe('Checkout Test Customer');
    expect(receipt.payer_name).toBe('Checkout Test Customer');
    expect(receipt.partner_address_snapshot).toBe('12 Lê Lợi');
    // No salesperson on this draft, so the fallback fires: the invoice's own staff (AC-04).
    expect(receipt.staff_id).toBe(fx.seed.userId);
    // Voucher-only: it points at the movement and the entry the saga already wrote.
    expect(receipt.cash_movement_id).not.toBeNull();
    expect(receipt.journal_entry_id).not.toBeNull();

    // AC-10 — the sale still owns exactly one journal entry.
    const jeAfter = await fx.ds.query(
      `SELECT count(*)::int AS c FROM journal_entries`,
    );
    expect(jeAfter[0].c - jeBefore[0].c).toBe(1);

    const linked = await fx.ds.query(
      `SELECT source_reference_id FROM journal_entries WHERE id = $1`,
      [receipt.journal_entry_id],
    );
    expect(linked[0].source_reference_id).toBe(invoiceId);
  });

  it('AC-02/AC-03: a walk-in sale leaves the partner blank but still records the branch address', async () => {
    const invoiceId = await createDraft();

    await checkout(invoiceId).expect(201);

    const [receipt] = await receiptsFor(invoiceId);
    expect(receipt.partner_type).toBeNull();
    expect(receipt.partner_id).toBeNull();
    expect(receipt.payer_name).toBeNull();
    expect(receipt.partner_address_snapshot).toBe('45 Nguyễn Huệ');
    expect(receipt.staff_id).toBe(fx.seed.userId);
  });

  it('AC-12: replaying the same idempotency key does not mint a second receipt', async () => {
    const invoiceId = await createDraft(fx.customerId);
    const key = randomUUID();

    await checkout(invoiceId, key).expect(201);
    await checkout(invoiceId, key).expect(201);

    expect(await receiptsFor(invoiceId)).toHaveLength(1);
  });

  it('AC-11: document numbers stay contiguous — no rollback ever burned one', async () => {
    // Every receipt this suite created, in creation order, must form an unbroken run. A
    // number minted outside the checkout transaction would leave a hole here the moment any
    // checkout failed.
    const rows = await fx.ds.query(
      `SELECT document_number FROM cash_receipts ORDER BY created_at ASC`,
    );
    const sequences = rows.map((r: { document_number: string }) =>
      Number(r.document_number.replace('PT', '')),
    );
    expect(sequences).toEqual(
      sequences.map((_: number, i: number) => sequences[0] + i),
    );
  });

  it('AC-13: a mixed cash + transfer sale leaves one Phiếu thu and one Phiếu thu tiền gửi', async () => {
    const invoiceId = await createDraft(fx.customerId);
    const jeBefore = await fx.ds.query(
      `SELECT count(*)::int AS c FROM journal_entries`,
    );

    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId,
        payments: [
          { paymentMethod: 'cash', amount: 40000 },
          { paymentMethod: 'bank_transfer', amount: 60000 },
        ],
      })
      .expect(201);

    const cashReceipts = await receiptsFor(invoiceId);
    expect(cashReceipts).toHaveLength(1);
    expect(Number(cashReceipts[0].total_amount)).toBe(40000);

    const bankReceipts = await fx.ds.query(
      `SELECT * FROM bank_receipts WHERE reference_id = $1 AND reference_type = 'INVOICE'`,
      [invoiceId],
    );
    expect(bankReceipts).toHaveLength(1);
    const bank = bankReceipts[0];
    expect(bank.status).toBe('POSTED');
    expect(Number(bank.total_amount)).toBe(60000);
    expect(bank.document_number).toMatch(/^NTTK\d{6}$/);
    expect(bank.partner_type).toBe('CUSTOMER');
    expect(bank.partner_id).toBe(fx.customerId);
    expect(bank.payer_name).toBe('Checkout Test Customer');
    expect(bank.partner_address_snapshot).toBe('12 Lê Lợi');
    // Bank vouchers hold the staff member in collected_by, not staff_id.
    expect(bank.collected_by).toBe(fx.seed.userId);
    expect(bank.deposit_movement_id).not.toBeNull();

    // Two documents, one sale, still one journal entry.
    const jeAfter = await fx.ds.query(
      `SELECT count(*)::int AS c FROM journal_entries`,
    );
    expect(jeAfter[0].c - jeBefore[0].c).toBe(1);

    // The two vouchers together account for everything the customer paid.
    expect(
      Number(cashReceipts[0].total_amount) + Number(bank.total_amount),
    ).toBe(100000);
  });
});
