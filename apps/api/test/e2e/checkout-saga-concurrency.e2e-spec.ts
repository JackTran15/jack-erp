import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  buildCheckoutSagaFixture,
  countBusinessRows,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';

/**
 * T-02-09 — the four hardest ACs, each a real bug of the v1 flow: (f) concurrent
 * checkout, (a) invoice-number jump, replay-not-double-post, and a full trace on
 * failure. Own fixture (own DB reset) — every test here deliberately races or
 * forces a rollback, and none of that should leak into the happy-path suite.
 */
describe('Checkout Saga v2 — concurrency & idempotency (E2E)', () => {
  let fx: CheckoutSagaFixture;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const createDraft = async (
    opts: { customerId?: string; itemId?: string; unitPrice?: number } = {},
  ): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: opts.customerId,
        items: [
          {
            itemId: opts.itemId ?? fx.itemId,
            locationId: fx.locationId,
            itemCode: 'CKO-ITEM',
            itemName: 'Item',
            unit: 'PCS',
            quantity: 1,
            unitPrice: opts.unitPrice ?? 100000,
          },
        ],
      })
      .expect(201);
    return res.body.id as string;
  };

  /** Trailing numeric sequence of a formatted document number, e.g. "INV-202608-00007" -> 7. */
  const extractSeq = (code: string): number => {
    const m = code.match(/-(\d+)$/);
    if (!m) throw new Error(`code "${code}" has no trailing numeric sequence`);
    return parseInt(m[1], 10);
  };

  const setupPointsCustomer = async (points: number): Promise<{ customerId: string; cardId: string }> => {
    const custRes = await request(fx.app.getHttpServer())
      .post('/customers')
      .set(fx.headers())
      .send({ name: `Concurrency Points ${randomUUID()}` })
      .expect(201);
    const customerId = custRes.body.id;
    const cardRes = await request(fx.app.getHttpServer())
      .get(`/customers/${customerId}/membership-card`)
      .set(fx.headers())
      .expect(200);
    const cardId = cardRes.body.id;
    await request(fx.app.getHttpServer())
      .post(`/customers/membership-cards/${cardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: points })
      .expect(201);
    return { customerId, cardId };
  };

  /**
   * Forces a real transactional-phase failure (redeem-points, the last step
   * before close-saga — i.e. "after step 08" per AC-15) via the same
   * insufficient-points-at-commit-time trick T-02-08's AC-09 already proved:
   * redeem what's available at draft time, then drain the card to 0 before
   * checkout actually runs, so the in-transaction re-check is what throws.
   */
  const forceTransactionalFailure = async (): Promise<{
    invoiceId: string;
    sagaId: string;
    cardId: string;
  }> => {
    const { customerId, cardId } = await setupPointsCustomer(500);
    const invoiceId = await createDraft({ customerId, itemId: fx.itemId3, unitPrice: 685000 });
    await request(fx.app.getHttpServer())
      .post(`/invoices/${invoiceId}/redeem-points`)
      .set(fx.headers())
      .send({ points: 500 })
      .expect(201);
    await request(fx.app.getHttpServer())
      .post(`/customers/membership-cards/${cardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: -500 })
      .expect(201);

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 435000 }] }) // 685000 - 500*500
      .expect(400);
    expect(res.body.details).toMatchObject({ failedStep: 'redeem-points' });

    return { invoiceId, sagaId: res.body.details.sagaId, cardId };
  };

  // ─── AC-10 — same idempotency key replays, no second invoice ─────────────
  it('AC-10: resubmitting the same request with the same x-idempotency-key replays the original result', async () => {
    const invoiceId = await createDraft();
    const key = `idem-${randomUUID()}`;
    const body = { invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] };

    const first = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set({ ...fx.headers(), 'x-idempotency-key': key })
      .send(body)
      .expect(201);

    const totalBefore = (await fx.ds.query(`SELECT count(*)::int AS c FROM invoices`))[0].c;

    const second = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set({ ...fx.headers(), 'x-idempotency-key': key })
      .send(body)
      .expect(201);

    expect(second.body.sagaId).toBe(first.body.sagaId);
    expect(second.body.documentNumber).toBe(first.body.documentNumber);
    expect(second.body.invoiceId).toBe(invoiceId);

    const totalAfter = (await fx.ds.query(`SELECT count(*)::int AS c FROM invoices`))[0].c;
    expect(totalAfter).toBe(totalBefore); // no second invoice from the replay

    const payments = await fx.ds.query(
      `SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(payments[0].c).toBe(1); // not duplicated
  });

  // ─── AC-11 part 1 + AC-13 + AC-15 part 1 — a real rollback, its trail, then a clean retry ──
  it('AC-11 + AC-13 + AC-15: a transactional failure leaves the document-number counter untouched, records a full FAILED trail with nothing after the failed step, and a retry on the same invoice then succeeds', async () => {
    // Depends on AC-10 (above) having already forced document-numbering's
    // default rule into existence via a real checkout.
    const [rule] = await fx.ds.query(
      `SELECT id FROM document_number_rules
       WHERE organization_id = $1 AND document_type = 'INVOICE' AND is_active = true LIMIT 1`,
      [fx.seed.organizationId],
    );
    const counterBefore = await fx.ds.query(
      `SELECT current_value FROM document_number_counters WHERE rule_id = $1`,
      [rule.id],
    );
    const before = counterBefore[0]?.current_value ?? null;

    const { invoiceId, sagaId, cardId } = await forceTransactionalFailure();

    // AC-15 part 1: the counter this failed run incremented did not stick.
    const counterAfter = await fx.ds.query(
      `SELECT current_value FROM document_number_counters WHERE rule_id = $1`,
      [rule.id],
    );
    expect(counterAfter[0]?.current_value ?? null).toEqual(before);

    // AC-13: GET sagas/:id shows the full trail — FAILED overall, the failed
    // step FAILED with an error, everything before it OK, nothing after.
    const sagaRes = await request(fx.app.getHttpServer())
      .get(`/v2/pos/checkout/sagas/${sagaId}`)
      .set(fx.headers())
      .expect(200);
    expect(sagaRes.body.saga.status).toBe('FAILED');

    const steps: Array<{ name: string; status: string; error: string | null }> = sagaRes.body.steps;
    // The trail is the whole ctx.trace, not just the transactional phase —
    // preflight steps ran and recorded too, before the transaction even opened.
    const stepsBeforeFailure = [
      'load-draft',
      'evaluate-promotion',
      'resolve-accounts',
      'resolve-funds',
      'compute-totals',
      'open-saga',
      'lock-invoice',
      'next-document-number',
      'redeem-voucher',
      'persist-invoice',
      'persist-payments',
      'create-debt',
    ];
    for (const name of stepsBeforeFailure) {
      const step = steps.find((s) => s.name === name);
      expect(step).toBeDefined();
      expect(step!.status).toBe('OK');
    }
    const failedStep = steps.find((s) => s.name === 'redeem-points');
    expect(failedStep).toBeDefined();
    expect(failedStep!.status).toBe('FAILED');
    expect(failedStep!.error).toBeTruthy();
    expect(steps.find((s) => s.name === 'close-saga')).toBeUndefined();
    expect(steps).toHaveLength(stepsBeforeFailure.length + 1);

    // AC-11 part 1: the rollback gave the draft back — restore the condition
    // that caused the failure (the card's own balance; `invoice.pointsRedeemed`
    // itself was set outside the checkout transaction and survived the
    // rollback unchanged), then retry the same invoice and it succeeds.
    await request(fx.app.getHttpServer())
      .post(`/customers/membership-cards/${cardId}/points`)
      .set(fx.headers())
      .send({ type: 'adjust', delta: 500 })
      .expect(201);

    const retry = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 435000 }] })
      .expect(201);
    expect(retry.body.committed).toBe(true);
  });

  // ─── AC-11 part 2 — concurrent checkouts, no idempotency key, on the same draft ──
  it('AC-11: two concurrent requests on the same draft with no idempotency key — exactly one succeeds, the other gets 409, no double-write', async () => {
    const invoiceId = await createDraft();
    // Checkout commits the existing draft row in place — it never inserts a
    // new invoice — so the row count before/after must be identical either way;
    // the real proof of "not double-processed" is the payments count below.
    const invoicesBefore = (await fx.ds.query(`SELECT count(*)::int AS c FROM invoices`))[0].c;
    const body = { invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] };

    const [r1, r2] = await Promise.all([
      request(fx.app.getHttpServer()).post('/v2/pos/checkout').set(fx.headers()).send(body),
      request(fx.app.getHttpServer()).post('/v2/pos/checkout').set(fx.headers()).send(body),
    ]);

    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const winner = r1.status === 201 ? r1 : r2;
    const loser = r1.status === 409 ? r1 : r2;
    expect(winner.body.committed).toBe(true);
    expect(loser.body.details).toMatchObject({ code: 'CHECKOUT_IN_PROGRESS' });

    const invoicesAfter = (await fx.ds.query(`SELECT count(*)::int AS c FROM invoices`))[0].c;
    expect(invoicesAfter).toBe(invoicesBefore);
    const [invoice] = await fx.ds.query(`SELECT status FROM invoices WHERE id = $1`, [invoiceId]);
    expect(invoice.status).toBe('paid');
    const payments = await fx.ds.query(
      `SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id = $1`,
      [invoiceId],
    );
    expect(payments[0].c).toBe(1); // exactly one write, not two
  });

  // ─── AC-15 part 2 — interleaved v1/v2 on the same branch: no jump, no collision ──
  it('AC-15: 10 v1 checkouts interleaved with 10 v2 checkouts on the same branch produce 20 unique, contiguous invoice codes', async () => {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const v1Id = await createDraft();
      const v1Res = await request(fx.app.getHttpServer())
        .post(`/invoices/${v1Id}/checkout`)
        .set(fx.headers())
        .send({ payments: [{ paymentMethod: 'cash', amount: 100000 }] })
        .expect(201);
      codes.push(v1Res.body.code);

      const v2Id = await createDraft();
      const v2Res = await request(fx.app.getHttpServer())
        .post('/v2/pos/checkout')
        .set(fx.headers())
        .send({ invoiceId: v2Id, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
        .expect(201);
      codes.push(v2Res.body.documentNumber);
    }

    expect(new Set(codes).size).toBe(20); // no collisions
    const sequences = codes.map(extractSeq).sort((a, b) => a - b);
    for (let i = 1; i < sequences.length; i++) {
      expect(sequences[i]).toBe(sequences[i - 1] + 1); // contiguous, no jump
    }
  });

  /**
   * Manual-only regression evidence for the bug this epic exists to fix —
   * left `it.skip`'d because it deliberately double-posts real rows against
   * the shared fixture. Run by hand once per T-02-09 verification (temporarily
   * remove `.skip`), record the actual counts in the ticket's "Kết quả kiểm
   * chứng" and in UOW-02's demo section, then restore `.skip` before committing.
   *
   * v1 has no lock and no idempotency guard on checkout (bug (f), 00-intent.md):
   * two concurrent `/invoices/:id/checkout` calls on the same draft both read
   * it unlocked, both run the full write chain, and whichever COMMITs its
   * UPDATE last wins the invoice row.
   *
   * 2026-08-05 manual run — `invoices` stayed flat (24→24, it's an UPDATE on
   * the existing draft, not an INSERT), but `invoice_payments` went 23→25:
   * **two** payment rows written for one checkout, on one invoice — the
   * clearest, fully-synchronous proof of the double-write (v1 writes payments
   * directly inside its own transaction, no async consumer involved).
   * `stock_ledger_entries`/`journal_entries`/`cash_movements` also moved
   * (11/1/0 delta respectively) but those postings go through the async Kafka
   * consumers (bug (b)/(c)) — a snapshot taken immediately after `Promise.all`
   * resolves can under-count them by consumer lag, so those three numbers are
   * not reliable evidence of exactly-once-vs-twice, only `invoice_payments` is.
   */
  it.skip('v1 comparison: two concurrent /v1 checkouts on the same draft double-post everything', async () => {
    const invoiceId = await createDraft();
    const before = await countBusinessRows(fx.ds);
    const body = { payments: [{ paymentMethod: 'cash', amount: 100000 }] };

    await Promise.all([
      request(fx.app.getHttpServer()).post(`/invoices/${invoiceId}/checkout`).set(fx.headers()).send(body),
      request(fx.app.getHttpServer()).post(`/invoices/${invoiceId}/checkout`).set(fx.headers()).send(body),
    ]);

    const after = await countBusinessRows(fx.ds);
    // eslint-disable-next-line no-console
    console.log('v1 concurrent-checkout counts before/after:', before, after);
  });
});
