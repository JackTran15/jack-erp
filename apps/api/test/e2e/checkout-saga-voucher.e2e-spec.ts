import { randomUUID } from 'crypto';
import request from 'supertest';
import {
  buildCheckoutSagaFixture,
  countBusinessRows,
  CheckoutSagaFixture,
} from './setup/checkout-saga-fixture';
import { seedPromotionFixtures } from './setup/promotion-seed';

/**
 * T-05-02 — AC-21, closing bug (h): on v1, `PromotionApplyService.apply`
 * (validate) and `commitPromotions` (mark used) are two separate transactions
 * minutes apart, so two drafts that both applied the same voucher can both
 * reach checkout and both redeem it. On v2, `redeem-voucher.step.ts`
 * (T-05-01) marks the voucher used inside the SAME transaction as everything
 * else, via `VoucherService.markUsed`'s conditional UPDATE — exactly one
 * concurrent checkout can win.
 */
describe('Checkout Saga v2 — voucher race (E2E)', () => {
  let fx: CheckoutSagaFixture;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    await seedPromotionFixtures(fx.app, {
      organizationId: fx.seed.organizationId,
      userId: fx.seed.userId,
    });
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const createVoucher = async (code: string, faceValue: number): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/v2/vouchers')
      .set(fx.headers())
      .send({ code, issuer: 'E2E', faceValue })
      .expect(201);
    return res.body.id as string;
  };

  const createDraft = async (): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        // Walk-in on purpose: keeps the outbox delta predictable (no
        // LOYALTY_POINTS_AWARD row) — irrelevant to what this ticket verifies.
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

  const checkout = (invoiceId: string, voucherCode: string) =>
    request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({
        invoiceId,
        payments: [{ paymentMethod: 'cash', amount: 70000 }], // 100000 - 30000 voucher
        voucherCode,
      });

  it('AC-21: two drafts racing the same voucher — exactly one wins, the loser rolls back with zero residue (5 iterations)', async () => {
    for (let i = 0; i < 5; i++) {
      const code = `RACE-${i}-${randomUUID().slice(0, 8)}`;
      const voucherId = await createVoucher(code, 30000);
      const invoiceA = await createDraft();
      const invoiceB = await createDraft();

      const before = await countBusinessRows(fx.ds);

      const [resA, resB] = await Promise.all([
        checkout(invoiceA, code),
        checkout(invoiceB, code),
      ]);

      const results = [
        { invoiceId: invoiceA, res: resA },
        { invoiceId: invoiceB, res: resB },
      ];
      const winners = results.filter((r) => r.res.status === 201);
      const losers = results.filter((r) => r.res.status !== 201);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(1);
      // The loser fails at one of several points depending on real timing —
      // all correct, and the ticket's own text accepts this TOCTOU gap
      // ("Validate ở preflight rồi tiêu ở transaction vẫn còn khe TOCTOU"):
      // - 400 VOUCHER_INVALID: the winner's whole commit already landed
      //   before the loser's own preflight `validate()` ran.
      // - 400 DOC_NUMBER_COUNTER_CONFLICT: both raced the *first-ever*
      //   invoice-number counter row for this org/branch/period (A-24) —
      //   unrelated to the voucher, but a real, accepted concurrent failure.
      // - 409 (ConflictException): lost the transactional `markUsed` race in
      //   redeem-voucher itself.
      // Whether the loser opened a transaction at all (and so left a FAILED
      // saga row per A-33) can't be inferred from the status code alone
      // (two of the three are 400) — read it off whether the error response
      // carries a `sagaId`, which only a transactional-phase failure sets.
      expect([400, 409]).toContain(losers[0].res.status);
      const loserReachedTransaction = Boolean(losers[0].res.body?.details?.sagaId);

      const [voucher] = await fx.ds.query(
        `SELECT is_used, redeemed_invoice_id FROM vouchers WHERE id = $1`,
        [voucherId],
      );
      expect(voucher).toMatchObject({
        is_used: true,
        redeemed_invoice_id: winners[0].invoiceId,
      });

      // The loser's own invoice: still a draft, zero rows anywhere.
      const [loserInvoice] = await fx.ds.query(
        `SELECT status, is_draft FROM invoices WHERE id = $1`,
        [losers[0].invoiceId],
      );
      expect(loserInvoice).toMatchObject({ status: 'draft', is_draft: true });
      const perInvoiceQueries = [
        `SELECT count(*)::int AS c FROM invoice_payments WHERE invoice_id = $1`,
        `SELECT count(*)::int AS c FROM stock_ledger_entries WHERE reference_id = $1 AND reference_type = 'INVOICE'`,
        `SELECT count(*)::int AS c FROM journal_entries WHERE source_reference_id = $1`,
        `SELECT count(*)::int AS c FROM cash_movements WHERE reference = $1`,
      ];
      for (const query of perInvoiceQueries) {
        const rows = await fx.ds.query(query, [losers[0].invoiceId]);
        expect(rows[0].c).toBe(0);
      }

      // Global sanity check: only the winner's own writes landed, plus one
      // checkout_saga row for the winner's COMPLETED run and — only when the
      // loser actually reached the transaction (409 case) — a second
      // checkout_saga row for its FAILED trail (A-33: a transactional failure
      // is not "0 rows changed", it leaves exactly one FAILED saga row
      // behind). A loser that failed at preflight (400) never opened a
      // transaction at all, so it adds none.
      const after = await countBusinessRows(fx.ds);
      expect(after).toEqual({
        ...before,
        invoice_payments: before.invoice_payments + 1,
        stock_ledger_entries: before.stock_ledger_entries + 1,
        journal_entries: before.journal_entries + 1,
        cash_movements: before.cash_movements + 1,
        outbox_messages: before.outbox_messages + 2, // SALE_POSTED + TEMP_WAREHOUSE_INVOICE_FULFILL (walk-in, no loyalty row)
        checkout_saga: before.checkout_saga + (loserReachedTransaction ? 2 : 1),
      });
    }
  });
});
