import { randomUUID } from 'crypto';
import request from 'supertest';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';
import { OutboxRelayService } from '../../src/modules/events/outbox/outbox-relay.service';
import { POINT_EARN_VND_PER_POINT } from '../../src/modules/customer/loyalty.constants';

/**
 * T-03-08 — AC-18. Scenario (b) from 00-intent.md, the most expensive bug of
 * the v1 flow: on v1, a dead broker means a PAID invoice with none of its
 * side effects and no way to recover. On v2 it must become a harmless queue.
 *
 * Simulated per the ticket's own allowed choice ("không cần dừng container
 * thật... hai cách đều mô phỏng được"): `OUTBOX_RELAY_DISABLED=1` (the whole
 * suite's standard env, A-19) already stops both the relay's periodic timer
 * AND `CheckoutSagaOrchestrator.runTransactional`'s own post-commit
 * `dispatchNow()` call (A-29) — so a real checkout under that env leaves its
 * outbox rows sitting `published_at IS NULL`, exactly as if Kafka were down,
 * with zero extra test scaffolding. The relay is switched back on by calling
 * `OutboxRelayService.pollOnce()` directly (never the interval timer, which
 * stays off for the rest of the suite).
 */
describe('Checkout Saga v2 — outbox durability (E2E)', () => {
  let fx: CheckoutSagaFixture;
  let relay: OutboxRelayService;
  let customerId: string;
  let cardId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    relay = fx.app.get(OutboxRelayService);

    const custRes = await request(fx.app.getHttpServer())
      .post('/customers')
      .set(fx.headers())
      .send({ name: `Outbox E2E Customer ${randomUUID()}` })
      .expect(201);
    customerId = custRes.body.id;
    const cardRes = await request(fx.app.getHttpServer())
      .get(`/customers/${customerId}/membership-card`)
      .set(fx.headers())
      .expect(200);
    cardId = cardRes.body.id;
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  /** Drives the relay every tick so a pending row gets a chance to publish. */
  const waitFor = async <T>(fn: () => Promise<T | null | undefined>, timeoutMs = 15000): Promise<T> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      await relay.pollOnce().catch(() => undefined);
      const r = await fn();
      if (r) return r;
      await new Promise((res) => setTimeout(res, 500));
    }
    throw new Error('timeout waiting for eventual consistency');
  };

  it('AC-18: relay disabled → checkout still fully succeeds, and its outbox rows sit pending', async () => {
    const draftRes = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId,
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
    const invoiceId = draftRes.body.id;

    const res = await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(201);
    expect(res.body.committed).toBe(true);

    // The synchronous side of the sale is complete regardless of Kafka.
    const [invoice] = await fx.ds.query(
      `SELECT status, is_draft FROM invoices WHERE id = $1`,
      [invoiceId],
    );
    expect(invoice).toMatchObject({ status: 'paid', is_draft: false });
    const ledgerRows = await fx.ds.query(
      `SELECT count(*)::int AS c FROM stock_ledger_entries WHERE reference_id = $1`,
      [invoiceId],
    );
    expect(ledgerRows[0].c).toBeGreaterThan(0);

    // enqueue-outbox.step.ts writes exactly 3 rows for an invoice with a
    // customer (SALE_POSTED, TEMP_WAREHOUSE_INVOICE_FULFILL,
    // LOYALTY_POINTS_AWARD) — not 4 as the ticket's own note first said; see
    // T-03-08's "Kết quả kiểm chứng" for the correction. All 3 sit pending:
    // `OUTBOX_RELAY_DISABLED=1` stopped both the relay's own timer and the
    // orchestrator's post-commit `dispatchNow()` (A-29).
    const pending = await fx.ds.query(
      `SELECT topic, published_at FROM outbox_messages WHERE payload->>'correlationId' = $1 ORDER BY topic`,
      [invoiceId],
    );
    expect(pending).toHaveLength(3);
    expect(pending.every((r: { published_at: unknown }) => r.published_at === null)).toBe(true);

    // Flip the relay on for this one invoice's rows — proves "Kafka is back
    // up" recovers everything without re-running the checkout.
    const published = await relay.pollOnce();
    expect(published).toBeGreaterThanOrEqual(3);
    const afterPublish = await fx.ds.query(
      `SELECT published_at FROM outbox_messages WHERE payload->>'correlationId' = $1`,
      [invoiceId],
    );
    expect(afterPublish.every((r: { published_at: unknown }) => r.published_at !== null)).toBe(true);

    // The real, already-existing LoyaltyPointsConsumer picks up the produced
    // LOYALTY_POINTS_AWARD message and awards the points — proving the
    // recovered message actually has a consequence, not just a DB flag flip.
    const expectedEarn = Math.floor(100000 / POINT_EARN_VND_PER_POINT);
    await waitFor(async () => {
      const [card] = await fx.ds.query(`SELECT points FROM membership_cards WHERE id = $1`, [cardId]);
      return Number(card.points) >= expectedEarn ? card : null;
    });
    const history = await fx.ds.query(
      `SELECT type FROM point_history WHERE invoice_id = $1 AND type = 'earn'`,
      [invoiceId],
    );
    expect(history).toHaveLength(1);
  });

  it('AC-18: redelivering the same outbox row (at-least-once) does not double the target-table effect', async () => {
    const custRes = await request(fx.app.getHttpServer())
      .post('/customers')
      .set(fx.headers())
      .send({ name: `Outbox Redelivery Customer ${randomUUID()}` })
      .expect(201);
    const redeliveryCustomerId = custRes.body.id;
    const cardRes = await request(fx.app.getHttpServer())
      .get(`/customers/${redeliveryCustomerId}/membership-card`)
      .set(fx.headers())
      .expect(200);
    const redeliveryCardId = cardRes.body.id;

    const draftRes = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: redeliveryCustomerId,
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
    const invoiceId = draftRes.body.id;

    await request(fx.app.getHttpServer())
      .post('/v2/pos/checkout')
      .set(fx.headers())
      .send({ invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] })
      .expect(201);

    const expectedEarn = Math.floor(100000 / POINT_EARN_VND_PER_POINT);
    await waitFor(async () => {
      const [card] = await fx.ds.query(`SELECT points FROM membership_cards WHERE id = $1`, [redeliveryCardId]);
      return Number(card.points) >= expectedEarn ? card : null;
    });
    const [{ eventId }] = await fx.ds.query(
      `SELECT payload->>'eventId' AS "eventId" FROM outbox_messages
       WHERE payload->>'correlationId' = $1 AND topic LIKE '%loyalty%'`,
      [invoiceId],
    );

    // Simulate a real at-least-once redelivery of the *same* eventId: reset
    // just this row so the relay treats it as pending again and re-produces
    // the identical payload — this is exactly the scenario
    // `OutboxRelayService`'s own doc comment describes ("publishes... to
    // Kafka at-least-once"), not a fabricated condition.
    await fx.ds.query(
      `UPDATE outbox_messages SET published_at = NULL
       WHERE payload->>'correlationId' = $1 AND payload->>'eventId' = $2`,
      [invoiceId, eventId],
    );
    const republished = await relay.pollOnce();
    expect(republished).toBeGreaterThanOrEqual(1);

    // Give the redelivered message every chance to be (wrongly) reprocessed,
    // then assert it wasn't: `processed_events` (event-idempotency.service.ts)
    // blocks the consumer from running a second time for the same eventId,
    // and the consumer's own point_history lookup is a second line of
    // defense — either way, exactly one EARN row must exist.
    for (let i = 0; i < 6; i++) {
      await relay.pollOnce().catch(() => undefined);
      await new Promise((res) => setTimeout(res, 500));
    }
    const history = await fx.ds.query(
      `SELECT type FROM point_history WHERE invoice_id = $1 AND type = 'earn'`,
      [invoiceId],
    );
    expect(history).toHaveLength(1);
    const [card] = await fx.ds.query(`SELECT points FROM membership_cards WHERE id = $1`, [redeliveryCardId]);
    expect(Number(card.points)).toBe(expectedEarn); // not earned twice

    const processedCount = await fx.ds.query(
      `SELECT count(*)::int AS c FROM processed_events WHERE event_id = $1`,
      [eventId],
    );
    expect(processedCount[0].c).toBe(1);
  });
});
