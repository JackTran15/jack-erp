import { randomUUID } from 'crypto';
import request from 'supertest';
import { authHeader } from './setup/test-app';
import {
  countBusinessRows,
  buildCheckoutSagaFixture,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';

// countBusinessRows / buildCheckoutSagaFixture / CheckoutSagaFixture moved to
// setup/checkout-saga-fixture.ts (T-02-09) — import from there, not from this
// file. `describe`/`it` are global and fire on module load, so importing a
// file matching jest's `.e2e-spec.ts$` testRegex re-registers its own suites
// a second time in whatever spec imports it; setup/checkout-saga-fixture.ts
// deliberately doesn't match that pattern.

describe('Checkout Saga v2 — dry-run (E2E)', () => {
  let fx: CheckoutSagaFixture;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const createDraft = async (opts: {
    customerId?: string;
    withLocation?: boolean;
    noItems?: boolean;
  } = {}): Promise<string> => {
    const items = opts.noItems
      ? undefined
      : [
          {
            itemId: fx.itemId,
            locationId: opts.withLocation === false ? undefined : fx.locationId,
            itemCode: 'CKO-ITEM-1',
            itemName: 'Item CKO-ITEM-1',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 100000,
          },
        ];
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: opts.customerId,
        items,
      })
      .expect(201);
    return res.body.id as string;
  };

  // ─── AC-01 — dry-run leaves everything untouched ──────────────────────
  it('AC-01: dry-run returns 5 preflight steps and leaves all 8 business tables unchanged', async () => {
    const invoiceId = await createDraft({ customerId: fx.customerId });
    const before = await countBusinessRows(fx.ds);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId,
        payments: [{ paymentMethod: 'cash', amount: 100000 }],
        dryRun: true,
      })
      .expect(201);

    const after = await countBusinessRows(fx.ds);

    expect(res.body.committed).toBe(false);
    expect(res.body.steps).toHaveLength(5);
    expect(res.body.steps.every((s: { status: string }) => s.status === 'OK')).toBe(true);
    expect(res.body.totals).toMatchObject({ amountDue: 100000, remainder: 0 });
    expect(after).toEqual(before);
  });

  // ─── AC-02 — dry-run totals match the real v1 flow on an identical draft ──
  it('AC-02: dry-run totals match checkout-invoice.service on an identically-shaped draft', async () => {
    const v2Draft = await createDraft({ customerId: fx.customerId });
    const v1Draft = await createDraft({ customerId: fx.customerId });

    const dry = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId: v2Draft,
        payments: [{ paymentMethod: 'cash', amount: 100000 }],
        dryRun: true,
      });

    const committed = await request(fx.app.getHttpServer())
      .post(`/invoices/${v1Draft}/checkout`)
      .set(fx.headers())
      .send({ payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(201);

    expect(dry.body.totals.amountDue).toBe(Number(committed.body.amountDue));
    expect(dry.body.totals.pointsEarned).toBe(committed.body.pointsEarned);
  });

  // ─── AC-03 — misconfigured branch fails at resolve-funds, before any write ──
  it('AC-03: a branch with no cash fund fails at resolve-funds, before any transaction opens', async () => {
    const branchBId = randomUUID();
    await fx.ds.query(
      `INSERT INTO branches (id, organization_id, name, status, is_main_branch, created_by, created_at, updated_at)
       VALUES ($1, $2, 'Branch B (no cash fund)', 'ACTIVE', false, $3, NOW(), NOW())`,
      [branchBId, fx.seed.organizationId, fx.seed.userId],
    );
    await fx.ds.query(
      `INSERT INTO user_branch_assignments (id, user_id, branch_id, organization_id, assigned_by)
       VALUES (gen_random_uuid(), $1, $2, $3, $1) ON CONFLICT DO NOTHING`,
      [fx.seed.userId, branchBId, fx.seed.organizationId],
    );
    // actor.branchId resolves as jwt > header (ActorContext decorator) — a
    // plain re-login mints branchIds[0] (branchA) as the JWT's own active
    // branchId, which wins over any X-Branch-Id header sent alongside it.
    // Only /auth/switch-branch actually changes the active branch — and it
    // revokes the CALLER's session (auth.service.ts: sessionStore.revokeSession),
    // so it must run on a disposable login, never on fx.seed.accessToken
    // (every other test in this file shares that session).
    const disposableLogin = await request(fx.app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123',
        organizationId: fx.seed.organizationId,
      })
      .expect(200);
    const switched = await request(fx.app.getHttpServer())
      .post('/auth/switch-branch')
      .set({ Authorization: authHeader(disposableLogin.body.accessToken) })
      .send({ branchId: branchBId })
      .expect(200);
    const branchBHeaders = {
      Authorization: authHeader(switched.body.accessToken),
      'X-Branch-Id': branchBId,
    };

    const draftRes = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(branchBHeaders)
      .send({
        sessionId: randomUUID(),
        items: [
          {
            itemId: fx.itemId,
            locationId: fx.locationId,
            itemCode: 'CKO-ITEM-1',
            itemName: 'Item CKO-ITEM-1',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      })
      .expect(201);

    const before = await countBusinessRows(fx.ds);
    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(branchBHeaders)
      .send({
        invoiceId: draftRes.body.id,
        payments: [{ paymentMethod: 'cash', amount: 100000 }],
        dryRun: true,
      })
      .expect(400);
    const after = await countBusinessRows(fx.ds);

    expect(after).toEqual(before);
    expect(res.body.details).toMatchObject({
      code: 'CASH_FUND_NOT_CONFIGURED',
      failedStep: 'resolve-funds',
    });
  });

  // ─── AC-04 — an invalid draft is rejected at load-draft, before anything else runs ──
  describe('AC-04: an invalid draft is rejected at load-draft', () => {
    it('a fully-paid (non-draft) invoice is rejected', async () => {
      const invoiceId = await createDraft({ customerId: fx.customerId });
      await request(fx.app.getHttpServer())
        .post(`/invoices/${invoiceId}/checkout`)
        .set(fx.headers())
        .send({ payments: [{ paymentMethod: 'cash', amount: 100000 }] })
        .expect(201);

      const res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({ invoiceId, payments: [], dryRun: true })
        .expect(400);

      expect(res.body.details).toMatchObject({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        failedStep: 'load-draft',
      });
    });

    it('a draft with no items is rejected', async () => {
      const invoiceId = await createDraft({ noItems: true });
      const res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({ invoiceId, payments: [], dryRun: true })
        .expect(400);

      expect(res.body.details).toMatchObject({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        failedStep: 'load-draft',
      });
    });

    it('a draft with an item missing locationId is rejected', async () => {
      const invoiceId = await createDraft({ withLocation: false });
      const res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({
          invoiceId,
          payments: [{ paymentMethod: 'cash', amount: 100000 }],
          dryRun: true,
        })
        .expect(400);

      expect(res.body.details).toMatchObject({
        code: 'INVOICE_NOT_CHECKOUTABLE',
        failedStep: 'load-draft',
      });
    });
  });

  // ─── Inherited from T-01-07: forbidNonWhitelisted actually rejects an unknown field ──
  it("rejects an unknown body field with 400 (proves ValidationPipe's forbidNonWhitelisted is active)", async () => {
    const invoiceId = await createDraft({ customerId: fx.customerId });
    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId,
        payments: [{ paymentMethod: 'cash', amount: 100000 }],
        dryRun: true,
        notAFieldOnTheDto: 'reject me',
      })
      .expect(400);
  });

  // ─── AC-12-adjacent: GET sagas/:id 404s cleanly (no saga rows exist until UOW-02) ──
  it('GET sagas/:id returns 404 for an id no saga has ever used', async () => {
    await request(fx.app.getHttpServer())
      .get(`/v2/pos/checkout/sagas/${randomUUID()}`)
      .set(fx.headers())
      .expect(404);
  });
});

/**
 * T-02-08 — commit path, parity against v1, and the saga trail. Own fixture
 * (own DB reset) so a rollback proven in one case never leaves state another
 * case could accidentally depend on.
 */
describe('Checkout Saga v2 — commit (E2E)', () => {
  let fx: CheckoutSagaFixture;
  let bankCoaId: string;
  let depositAccountId: string;
  let bankPaymentAccountId: string;
  let pointsCustomerId: string;
  let pointsCardId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();

    // bank_transfer payment_accounts + backing deposit fund, same shape as
    // deposit-fund.e2e-spec.ts. Nothing in this slice actually posts to the
    // deposit fund yet (post-deposit is UOW-03) — this only proves
    // resolve-accounts / persist-payments thread depositAccountId end to end
    // (AC-08). A dedicated COA (not '1121') so it never collides with a COA
    // another e2e file might seed under the same organization.
    const bankCoa = await fx.ds.query(
      `INSERT INTO accounts (id, organization_id, code, name, type, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '1121-CKO', 'Bank E2E Checkout', 'ASSET', true, $2, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.userId],
    );
    bankCoaId = bankCoa[0].id;

    const bankRow = await fx.ds.query(
      `INSERT INTO banks (id, organization_id, code, name, is_active, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'CKO-VCB', 'Checkout Bank', true, $2, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.userId],
    );

    const depositRow = await fx.ds.query(
      `INSERT INTO deposit_accounts
         (id, organization_id, branch_id, name, code, account_no, account_name,
          bank_id, type, account_id, opening_balance, opening_date, balance,
          allow_negative, is_default, status, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'Checkout Deposit', 'DEP-CKO', 'ACC-CKO', 'ERP Test',
               $3, 'BANK_ACCOUNT', $4, 0, '2026-01-01', 0, false, false, 'ACTIVE', $5, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, fx.seed.branchId, bankRow[0].id, bankCoaId, fx.seed.userId],
    );
    depositAccountId = depositRow[0].id;

    const paymentAccountRow = await fx.ds.query(
      `INSERT INTO payment_accounts
         (id, organization_id, branch_id, payment_method, account_id, deposit_account_id, is_active, sort_order, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, NULL, 'bank_transfer', $2, $3, true, 0, $4, NOW(), NOW())
       RETURNING id`,
      [fx.seed.organizationId, bankCoaId, depositAccountId, fx.seed.userId],
    );
    bankPaymentAccountId = paymentAccountRow[0].id;

    // Dedicated customer + card for the points cases, kept separate from
    // fx.customerId so no other case in this block moves its balance.
    // CustomerService.create already auto-issues a membership card in the
    // same transaction (customer.service.ts:74-96) — fetch it rather than
    // issuing a second one, which would 409 against that auto-created card.
    const custRes = await request(fx.app.getHttpServer())
      .post('/customers')
      .set(fx.headers())
      .send({ name: 'Checkout Points Customer' })
      .expect(201);
    pointsCustomerId = custRes.body.id;

    const cardRes = await request(fx.app.getHttpServer())
      .get(`/customers/${pointsCustomerId}/membership-card`)
      .set(fx.headers())
      .expect(200);
    pointsCardId = cardRes.body.id;

    await request(fx.app.getHttpServer())
      .post(`/customers/membership-cards/${pointsCardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: 1000 })
      .expect(201);
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  interface DraftLine {
    itemId: string;
    unitPrice: number;
    quantity?: number;
  }

  const createDraft = async (
    lines: DraftLine[],
    opts: { customerId?: string } = {},
  ): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: opts.customerId,
        items: lines.map((line, idx) => ({
          itemId: line.itemId,
          locationId: fx.locationId,
          itemCode: `CKO-ITEM-${idx + 1}`,
          itemName: `Item ${idx + 1}`,
          unit: 'PCS',
          quantity: line.quantity ?? 1,
          unitPrice: line.unitPrice,
        })),
      })
      .expect(201);
    return res.body.id as string;
  };

  /**
   * Compares a v2-committed invoice against a v1-committed one built from an
   * identically-shaped draft, ignoring the fields that are legitimately
   * different per-run (id, code, timestamps) or per-customer-state at call
   * time (pointsBalanceAfter — see the dedicated AC-09 case for that).
   */
  const expectInvoiceParity = async (v1Id: string, v2Id: string) => {
    const strip = (row: Record<string, unknown>) => {
      const {
        id, code, created_at, updated_at, issued_at, points_balance_after, session_id,
        ...rest
      } = row;
      return rest;
    };
    const [v1Invoice] = await fx.ds.query(`SELECT * FROM invoices WHERE id = $1`, [v1Id]);
    const [v2Invoice] = await fx.ds.query(`SELECT * FROM invoices WHERE id = $1`, [v2Id]);
    expect(strip(v2Invoice)).toEqual(strip(v1Invoice));

    const cols = `payment_method, amount, account_id, deposit_account_id`;
    const v1Payments = await fx.ds.query(
      `SELECT ${cols} FROM invoice_payments WHERE invoice_id = $1 ORDER BY amount`,
      [v1Id],
    );
    const v2Payments = await fx.ds.query(
      `SELECT ${cols} FROM invoice_payments WHERE invoice_id = $1 ORDER BY amount`,
      [v2Id],
    );
    expect(v2Payments).toEqual(v1Payments);

    const debtCols = `remaining_amount, due_date, credit_days`;
    const v1Debts = await fx.ds.query(
      `SELECT ${debtCols} FROM invoice_debts WHERE invoice_id = $1`,
      [v1Id],
    );
    const v2Debts = await fx.ds.query(
      `SELECT ${debtCols} FROM invoice_debts WHERE invoice_id = $1`,
      [v2Id],
    );
    expect(v2Debts).toEqual(v1Debts);
  };

  // ─── AC-05 — cash paid in full, plus AC-12 (trace on success) ─────────────
  it('AC-05 + AC-12: cash paid in full → PAID, one payment row, no debt, full trace, parity with v1', async () => {
    const v2Draft = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }], {
      customerId: fx.customerId,
    });
    const v1Draft = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }], {
      customerId: fx.customerId,
    });

    const requestId = `req-${randomUUID()}`;
    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set({ ...fx.headers(), 'x-request-id': requestId })
      .send({ invoiceId: v2Draft, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(201);

    expect(res.body.committed).toBe(true);
    expect(res.body.invoiceId).toBe(v2Draft);
    expect(res.body.sagaId).toBeTruthy();
    expect(res.body.documentNumber).toBeTruthy();
    expect(res.body.totals).toMatchObject({ amountDue: 100000, remainder: 0 });

    const [invoice] = await fx.ds.query(
      `SELECT status, is_draft, code, issued_at FROM invoices WHERE id = $1`,
      [v2Draft],
    );
    expect(invoice).toMatchObject({ status: 'paid', is_draft: false });
    expect(invoice.code).toBeTruthy();
    expect(invoice.issued_at).toBeTruthy();

    const payments = await fx.ds.query(
      `SELECT payment_method, amount, account_id FROM invoice_payments WHERE invoice_id = $1`,
      [v2Draft],
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].payment_method).toBe('cash');

    const debts = await fx.ds.query(`SELECT * FROM invoice_debts WHERE invoice_id = $1`, [v2Draft]);
    expect(debts).toHaveLength(0);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${v1Draft}/checkout`)
      .set(fx.headers())
      .send({ payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(201);
    await expectInvoiceParity(v1Draft, v2Draft);

    // AC-12: the saga trail is complete and readable right after the 2xx.
    const sagaRes = await request(fx.app.getHttpServer())
      .get(`/v2/pos/checkout/sagas/${res.body.sagaId}`)
      .set(fx.headers())
      .expect(200);
    expect(sagaRes.body.saga).toMatchObject({ status: 'COMPLETED', correlationId: requestId });
    expect(sagaRes.body.steps).toHaveLength(19); // T-05-01: 5 preflight + 14 transactional (redeem-voucher added)
    const seqs = sagaRes.body.steps.map((s: { seq: number }) => s.seq);
    expect(seqs).toEqual([...Array(19)].map((_, i) => i + 1));
    expect(sagaRes.body.steps.every((s: { status: string }) => s.status === 'OK')).toBe(true);
  });

  // ─── AC-06 — full debt and partial debt ────────────────────────────────
  it('AC-06: no payment on a credit sale → DEBT, one invoice_debts row for the full amount, parity with v1', async () => {
    const v2Draft = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }], {
      customerId: fx.customerId,
    });
    const v1Draft = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }], {
      customerId: fx.customerId,
    });
    const body = { payments: [], dueDate: '2026-12-31', creditDays: 30 };

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId: v2Draft, ...body })
      .expect(201);
    expect(res.body.totals).toMatchObject({ remainder: 200000, newStatus: 'debt' });

    const [invoice] = await fx.ds.query(`SELECT status FROM invoices WHERE id = $1`, [v2Draft]);
    expect(invoice.status).toBe('debt');
    const debts = await fx.ds.query(
      `SELECT remaining_amount, due_date, credit_days FROM invoice_debts WHERE invoice_id = $1`,
      [v2Draft],
    );
    expect(debts).toHaveLength(1);
    expect(Number(debts[0].remaining_amount)).toBe(200000);
    expect(debts[0].credit_days).toBe(30);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${v1Draft}/checkout`)
      .set(fx.headers())
      .send(body)
      .expect(201);
    await expectInvoiceParity(v1Draft, v2Draft);
  });

  it('AC-06: partial payment on a credit sale → PARTIAL_DEBT, remainingAmount = amountDue - totalPaid, parity with v1', async () => {
    const v2Draft = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }], {
      customerId: fx.customerId,
    });
    const v1Draft = await createDraft([{ itemId: fx.itemId2, unitPrice: 200000 }], {
      customerId: fx.customerId,
    });
    const body = {
      payments: [{ paymentMethod: 'cash', amount: 50000 }],
      dueDate: '2026-12-31',
      creditDays: 15,
    };

    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId: v2Draft, ...body })
      .expect(201);

    const [invoice] = await fx.ds.query(`SELECT status FROM invoices WHERE id = $1`, [v2Draft]);
    expect(invoice.status).toBe('partial_debt');
    const debts = await fx.ds.query(
      `SELECT remaining_amount FROM invoice_debts WHERE invoice_id = $1`,
      [v2Draft],
    );
    expect(Number(debts[0].remaining_amount)).toBe(150000);

    await request(fx.app.getHttpServer())
      .post(`/invoices/${v1Draft}/checkout`)
      .set(fx.headers())
      .send(body)
      .expect(201);
    await expectInvoiceParity(v1Draft, v2Draft);
  });

  // ─── AC-07 — overpay and debt-without-customer are both rejected, no rows left ──
  it('AC-07: paying more than amountDue is rejected with 400 and leaves every table unchanged', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }], {
      customerId: fx.customerId,
    });
    const before = await countBusinessRows(fx.ds);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 150000 }] })
      .expect(400);
    expect(res.body.details).toMatchObject({ code: 'PAYMENT_INVALID', failedStep: 'compute-totals' });

    expect(await countBusinessRows(fx.ds)).toEqual(before);
  });

  it('AC-07: a remaining balance with no customer on the invoice is rejected with 400 and leaves every table unchanged', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }]); // no customerId
    const before = await countBusinessRows(fx.ds);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [] })
      .expect(400);
    expect(res.body.details).toMatchObject({ code: 'PAYMENT_INVALID', failedStep: 'compute-totals' });

    expect(await countBusinessRows(fx.ds)).toEqual(before);
  });

  // ─── AC-08 — split cash + bank_transfer, each line keeps its own resolved accounts ──
  it('AC-08: cash + bank_transfer on two lines each resolve their own accountId/depositAccountId', async () => {
    const invoiceId = await createDraft([
      { itemId: fx.itemId, unitPrice: 100000 },
      { itemId: fx.itemId2, unitPrice: 200000 },
    ]);

    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId,
        payments: [
          { paymentMethod: 'cash', amount: 100000 },
          {
            paymentMethod: 'bank_transfer',
            amount: 200000,
            paymentAccountId: bankPaymentAccountId,
          },
        ],
      })
      .expect(201);

    const payments = await fx.ds.query(
      `SELECT payment_method, amount, account_id, deposit_account_id
       FROM invoice_payments WHERE invoice_id = $1 ORDER BY amount`,
      [invoiceId],
    );
    expect(payments).toHaveLength(2);
    expect(payments[0]).toMatchObject({ payment_method: 'cash', amount: '100000.00' });
    expect(payments[0].deposit_account_id).toBeNull();
    expect(payments[1]).toMatchObject({
      payment_method: 'bank_transfer',
      amount: '200000.00',
      account_id: bankCoaId,
      deposit_account_id: depositAccountId,
    });
  });

  // ─── AC-09 — points redemption debited in the transaction, projected balance correct ──
  it('AC-09: redeeming points debits the card in-transaction and projects pointsBalanceAfter correctly', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }], {
      customerId: pointsCustomerId,
    });
    await request(fx.app.getHttpServer())
      .post(`/invoices/${invoiceId}/redeem-points`)
      .set(fx.headers())
      .send({ points: 100 })
      .expect(201);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 50000 }] })
      .expect(201);
    expect(res.body.totals).toMatchObject({
      amountDue: 50000, // 100000 subtotal - 100*500 points discount
      pointsEarned: 5, // floor(50000 / 10000)
    });

    const [invoice] = await fx.ds.query(
      `SELECT points_balance_after FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    // Card started at 1000: -100 redeemed +5 earned = 905, projected on the
    // invoice row even though the +5 EARN credit is not applied to the card
    // yet — that only happens via the async loyalty consumer once
    // enqueue-outbox (UOW-03) actually publishes the event.
    expect(Number(invoice.points_balance_after)).toBe(905);

    const [card] = await fx.ds.query(
      `SELECT points FROM membership_cards WHERE id = $1`,
      [pointsCardId],
    );
    expect(Number(card.points)).toBe(900); // -100 redeemed; +5 earn not yet applied (ADR-04)

    const history = await fx.ds.query(
      `SELECT type, delta FROM point_history WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(history).toEqual([{ type: 'redeem', delta: -100 }]);
  });

  it('AC-09: insufficient points at commit time rolls back the whole checkout, not just the redemption', async () => {
    // Card is at 900 after the previous case. Redeem exactly what is
    // available right now (allowed at draft time)...
    const invoiceId = await createDraft([{ itemId: fx.itemId3, unitPrice: 685000 }], {
      customerId: pointsCustomerId,
    });
    await request(fx.app.getHttpServer())
      .post(`/invoices/${invoiceId}/redeem-points`)
      .set(fx.headers())
      .send({ points: 900 })
      .expect(201);

    // ...then drain the card to 0 before checkout actually runs, so the
    // re-validation inside the transaction is the one that catches it.
    await request(fx.app.getHttpServer())
      .post(`/customers/membership-cards/${pointsCardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: -900 })
      .expect(201);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 235000 }] }) // 685000 - 900*500
      .expect(400);
    expect(res.body.details).toMatchObject({ failedStep: 'redeem-points' });
    expect(res.body.message).toContain('Insufficient points');

    // Whole checkout rolled back — not just the redemption.
    const [invoice] = await fx.ds.query(
      `SELECT status, is_draft FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(invoice).toMatchObject({ status: 'draft', is_draft: true });
    const payments = await fx.ds.query(
      `SELECT * FROM invoice_payments WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(payments).toHaveLength(0);
    const [card] = await fx.ds.query(
      `SELECT points FROM membership_cards WHERE id = $1`,
      [pointsCardId],
    );
    expect(Number(card.points)).toBe(0); // unchanged by the rolled-back decrement
    const history = await fx.ds.query(
      `SELECT * FROM point_history WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(history).toHaveLength(0);
  });

  // ─── T-03-07 — AC-13, AC-16, AC-17: three real, late failure points, each a ──
  // ─── genuine condition (not a mock), each proving 00-intent.md's success ──
  // ─── signal: a failed run leaves 0 rows in the 8 business tables and the ──
  // ─── document-number counter untouched. ──────────────────────────────────
  //
  // Three positions, not one, because each fails for a genuinely different
  // reason: a dangling FK (deduct-stock itself), a missing numbering rule
  // (post-journal, after stock is already deducted), and a locked accounting
  // period (post-deposit, after stock+journal+cash all already succeeded).
  //
  // post-cash.step.ts has no realistically triggerable failure of its own —
  // `funds.cashAccountId` is re-resolved fresh by resolve-funds in the very
  // same request's preflight phase, so anything that would break it (fund
  // deleted, second fund appearing) makes preflight reject the request before
  // any transactional step ever runs; the step has no document-numbering and
  // no unique constraint of its own to violate either. Traced directly from
  // its source, not assumed. Substituted the third position with post-deposit
  // (a strictly later point, still "after cash was collected") rather than
  // force an artificial failure via mocking, which the epic's e2e suites have
  // never done.

  it('AC-13/16/17 (1/3): deduct-stock itself fails on a real dangling-location FK violation — nothing before it left any residue', async () => {
    // A brand-new item + location this test alone ever touches, so deleting
    // the location cannot collide with a stock_balances row any other test
    // already created for it.
    const storageRes = await request(fx.app.getHttpServer())
      .post('/inventory/storages')
      .set(fx.headers())
      .send({ name: `Doomed Storage ${randomUUID()}`, branchId: fx.seed.branchId })
      .expect(201);
    const locRes = await request(fx.app.getHttpServer())
      .post('/inventory/locations')
      .set(fx.headers())
      .send({
        code: `DOOMED-${randomUUID().slice(0, 8)}`,
        type: 'SHELF',
        name: 'Doomed Location',
        storageId: storageRes.body.id,
        branchId: fx.seed.branchId,
      })
      .expect(201);
    const doomedLocationId = locRes.body.id;
    const itemRes = await request(fx.app.getHttpServer())
      .post('/inventory/items')
      .set(fx.headers())
      .send({
        code: `DOOMED-ITEM-${randomUUID().slice(0, 8)}`,
        name: 'Doomed Item',
        unit: 'PCS',
        purchasePrice: 60000,
        sellingPrice: 100000,
      })
      .expect(201);

    // Built directly rather than via the shared `createDraft` helper — that
    // helper hardcodes every line to `fx.locationId`, and this test needs its
    // own, disposable location instead.
    const draftRes = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: fx.customerId,
        items: [
          {
            itemId: itemRes.body.id,
            locationId: doomedLocationId,
            itemCode: 'DOOMED',
            itemName: 'Doomed Item',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      })
      .expect(201);
    const invoiceId = draftRes.body.id;
    // load-draft only guards "the line has *a* locationId" (T-01-09) — it never
    // re-checks the row still exists, so this slips past every preflight step
    // and only bites when deduct-stock actually tries to write stock_balances.
    await fx.ds.query(`DELETE FROM locations WHERE id = $1`, [doomedLocationId]);

    const before = await countBusinessRows(fx.ds);
    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(500);
    expect(res.body.details.failedStep).toBe('deduct-stock');

    // `checkout_saga` gains exactly the FAILED trail row (ADR-01) — every
    // other business table is untouched.
    expect(await countBusinessRows(fx.ds)).toEqual({
      ...before,
      checkout_saga: before.checkout_saga + 1,
    });
    const [invoice] = await fx.ds.query(
      `SELECT status, is_draft FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(invoice).toMatchObject({ status: 'draft', is_draft: true });

    const sagaRes = await request(fx.app.getHttpServer())
      .get(`/v2/pos/checkout/sagas/${res.body.details.sagaId}`)
      .set(fx.headers())
      .expect(200);
    expect(sagaRes.body.saga.status).toBe('FAILED');
    const steps: Array<{ name: string; status: string }> = sagaRes.body.steps;
    expect(steps.find((s) => s.name === 'deduct-stock')).toMatchObject({ status: 'FAILED' });
    expect(steps.find((s) => s.name === 'post-journal')).toBeUndefined();
  });

  it('AC-13/16/17 (2/3): post-journal fails when the JOURNAL numbering rule is deactivated — stock already deducted, everything still rolls back', async () => {
    const invoiceId = await createDraft([{ itemId: fx.itemId, unitPrice: 100000 }], {
      customerId: fx.customerId,
    });

    // seedBaseData (test-app.ts) seeds an active rule for every DocumentType,
    // including JOURNAL — deactivating it is the only thing standing between
    // resolve-accounts (preflight, which never checks JOURNAL numbering) and
    // post-journal's own `mintDocumentNumber` throwing DOC_NUMBER_RULE_MISSING.
    const [rule] = await fx.ds.query(
      `SELECT id FROM document_number_rules
       WHERE organization_id = $1 AND document_type = 'JOURNAL' AND is_active = true LIMIT 1`,
      [fx.seed.organizationId],
    );
    expect(rule).toBeDefined();
    await fx.ds.query(`UPDATE document_number_rules SET is_active = false WHERE id = $1`, [rule.id]);

    try {
      const before = await countBusinessRows(fx.ds);
      const res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
        .expect(400);
      expect(res.body.details).toMatchObject({
        code: 'DOC_NUMBER_RULE_MISSING',
        failedStep: 'post-journal',
      });

      expect(await countBusinessRows(fx.ds)).toEqual({
        ...before,
        checkout_saga: before.checkout_saga + 1,
      });
      const [invoice] = await fx.ds.query(
        `SELECT status, is_draft FROM invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(invoice).toMatchObject({ status: 'draft', is_draft: true });

      const sagaRes = await request(fx.app.getHttpServer())
        .get(`/v2/pos/checkout/sagas/${res.body.details.sagaId}`)
        .set(fx.headers())
        .expect(200);
      expect(sagaRes.body.saga.status).toBe('FAILED');
      const steps: Array<{ name: string; status: string }> = sagaRes.body.steps;
      expect(steps.find((s) => s.name === 'deduct-stock')).toMatchObject({ status: 'OK' });
      expect(steps.find((s) => s.name === 'post-journal')).toMatchObject({ status: 'FAILED' });
      expect(steps.find((s) => s.name === 'post-cash')).toBeUndefined();
    } finally {
      // Org-wide rule, shared by every other test in this file — must not
      // leak into whatever runs after this one.
      await fx.ds.query(`UPDATE document_number_rules SET is_active = true WHERE id = $1`, [rule.id]);
    }
  });

  it('AC-13/16/17 (3/3): post-deposit fails when the period is locked — stock deducted, journal posted, cash collected, everything still rolls back', async () => {
    const invoiceId = await createDraft([
      { itemId: fx.itemId, unitPrice: 100000 },
      { itemId: fx.itemId2, unitPrice: 200000 },
    ]);

    // docDate inside post-deposit.step.ts is `new Date().toISOString().slice(0, 10)`
    // — lock exactly the period that resolves to, so the guard trips for real.
    const period = new Date().toISOString().slice(0, 7);
    await fx.ds.query(
      `INSERT INTO deposit_period_lock
         (id, organization_id, branch_id, period, status, closing_balance_snapshot, locked_by, locked_at, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'LOCKED', '[]'::jsonb, $4, NOW(), NOW(), NOW())`,
      [fx.seed.organizationId, fx.seed.branchId, period, fx.seed.userId],
    );

    try {
      const before = await countBusinessRows(fx.ds);
      const res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({
          invoiceId,
          payments: [
            { paymentMethod: 'cash', amount: 100000 },
            { paymentMethod: 'bank_transfer', amount: 200000, paymentAccountId: bankPaymentAccountId },
          ],
        })
        .expect(409);
      expect(res.body.details.failedStep).toBe('post-deposit');

      expect(await countBusinessRows(fx.ds)).toEqual({
        ...before,
        checkout_saga: before.checkout_saga + 1,
      });
      const [invoice] = await fx.ds.query(
        `SELECT status, is_draft FROM invoices WHERE id = $1`,
        [invoiceId],
      );
      expect(invoice).toMatchObject({ status: 'draft', is_draft: true });

      const sagaRes = await request(fx.app.getHttpServer())
        .get(`/v2/pos/checkout/sagas/${res.body.details.sagaId}`)
        .set(fx.headers())
        .expect(200);
      expect(sagaRes.body.saga.status).toBe('FAILED');
      const steps: Array<{ name: string; status: string }> = sagaRes.body.steps;
      for (const name of ['deduct-stock', 'post-journal', 'post-cash']) {
        expect(steps.find((s) => s.name === name)).toMatchObject({ status: 'OK' });
      }
      expect(steps.find((s) => s.name === 'post-deposit')).toMatchObject({ status: 'FAILED' });
      expect(steps.find((s) => s.name === 'enqueue-outbox')).toBeUndefined();
    } finally {
      await fx.ds.query(
        `DELETE FROM deposit_period_lock WHERE organization_id = $1 AND branch_id = $2 AND period = $3`,
        [fx.seed.organizationId, fx.seed.branchId, period],
      );
    }
  });
});
