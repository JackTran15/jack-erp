import { randomUUID } from 'crypto';
import request from 'supertest';
import { buildCheckoutSagaFixture, CheckoutSagaFixture } from './setup/checkout-saga-fixture';

/**
 * T-03-09 — spike answering A-09 / the ADR-02/ADR-03 performance question:
 * is v2's checkout transaction (4 extra inline writes, plus a document-number
 * counter row locked from step 08 to COMMIT) meaningfully slower than v1's?
 *
 * This is a spike, not a gate: `it.skip` by default so CI never depends on
 * the machine it happens to run on. Run it by hand (flip `it.skip` to `it`
 * locally, never commit that flip), read the printed table, and transcribe
 * the real numbers into `01-assumptions.md`'s A-09 conclusion — that
 * transcription, not this file staying green, is what actually closes A-09.
 */
describe('Checkout Saga v2 — performance spike (T-03-09, run by hand)', () => {
  let fx: CheckoutSagaFixture;
  let perfItemId: string;

  beforeAll(async () => {
    fx = await buildCheckoutSagaFixture();
    // A dedicated, generously-stocked item so 100+ sequential sales plus a
    // concurrent round never approach a real stock boundary — negative stock
    // is allowed anyway, but this keeps the run from ever exercising that path.
    const itemRes = await request(fx.app.getHttpServer())
      .post('/inventory/items')
      .set(fx.headers())
      .send({ code: `PERF-ITEM-${randomUUID().slice(0, 8)}`, name: 'Perf Item', unit: 'PCS', purchasePrice: 60000, sellingPrice: 100000 })
      .expect(201);
    perfItemId = itemRes.body.id;
    await fx.ds.query(
      `INSERT INTO stock_balances (id, organization_id, branch_id, item_id, location_id, quantity, created_by, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 100000, $5, NOW(), NOW())`,
      [fx.seed.organizationId, fx.seed.branchId, perfItemId, fx.locationId, fx.seed.userId],
    );
  }, 180_000);

  afterAll(async () => {
    await fx.app.close();
  });

  const createDraft = async (): Promise<string> => {
    const res = await request(fx.app.getHttpServer())
      .post('/invoices')
      .set(fx.headers())
      .send({
        sessionId: randomUUID(),
        customerId: fx.customerId,
        items: [
          {
            itemId: perfItemId,
            locationId: fx.locationId,
            itemCode: 'PERF',
            itemName: 'Perf Item',
            unit: 'PCS',
            quantity: 1,
            unitPrice: 100000,
          },
        ],
      })
      .expect(201);
    return res.body.id as string;
  };

  /** Strict: only for the sequential rounds, where every call must succeed. */
  const timedCheckout = async (invoiceId: string, path: string): Promise<number> => {
    const start = process.hrtime.bigint();
    await request(fx.app.getHttpServer())
      .post(path)
      .set(fx.headers())
      .send(
        path === '/v2/pos/checkout'
          ? { invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] }
          : { payments: [{ paymentMethod: 'cash', amount: 100000 }] },
      )
      .expect(201);
    return Number(process.hrtime.bigint() - start) / 1_000_000; // ms
  };

  /**
   * Non-strict: for the concurrent rounds. v1's own `SERIALIZABLE` document
   * numbering (bug (a) in 00-intent.md) genuinely rejects some fraction of
   * truly concurrent requests with `could not serialize access` — that
   * failure rate is itself data A-09 cares about (v2's `pessimistic_write`
   * queues instead of rejecting), not a bug in this test to paper over.
   */
  const timedCheckoutSettled = async (
    invoiceId: string,
    path: string,
  ): Promise<{ ok: boolean; durationMs: number }> => {
    const start = process.hrtime.bigint();
    const res = await request(fx.app.getHttpServer())
      .post(path)
      .set(fx.headers())
      .send(
        path === '/v2/pos/checkout'
          ? { invoiceId, payments: [{ paymentMethod: 'cash', amount: 100000 }] }
          : { payments: [{ paymentMethod: 'cash', amount: 100000 }] },
      );
    return { ok: res.status === 201, durationMs: Number(process.hrtime.bigint() - start) / 1_000_000 };
  };

  const percentile = (sorted: number[], p: number): number => {
    const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
    return sorted[Math.max(0, idx)];
  };

  const summarize = (label: string, durationsMs: number[]) => {
    const sorted = [...durationsMs].sort((a, b) => a - b);
    const p50 = percentile(sorted, 50);
    const p95 = percentile(sorted, 95);
    const max = sorted[sorted.length - 1];
    // eslint-disable-next-line no-console
    console.log(`[T-03-09] ${label}: n=${sorted.length} p50=${p50.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`);
    return { p50, p95, max };
  };

  it.skip('spike: p50/p95/max, v1 vs v2, sequential (N=50) and concurrent (10 on one branch)', async () => {
    const N = 50;

    const v1Durations: number[] = [];
    for (let i = 0; i < N; i++) {
      const invoiceId = await createDraft();
      v1Durations.push(await timedCheckout(invoiceId, `/invoices/${invoiceId}/checkout`));
    }
    const v1Seq = summarize('v1 sequential', v1Durations);

    const v2Durations: number[] = [];
    for (let i = 0; i < N; i++) {
      const invoiceId = await createDraft();
      v2Durations.push(await timedCheckout(invoiceId, '/v2/pos/checkout'));
    }
    const v2Seq = summarize('v2 sequential', v2Durations);

    // The measurement A-09 actually cares about: 10 checkouts on the SAME
    // branch racing for the same document_number_counters row (ADR-02 locks
    // it from step 08 to COMMIT) — sequential timing alone can't show
    // lock-contention cost, only per-request overhead. Drafts are created
    // sequentially first (concurrent draft creation is its own, unrelated
    // contention on v1 code this ticket has no reason to measure) — only the
    // checkout calls themselves fire concurrently.
    const CONCURRENT = 10;
    const concurrentInvoiceIds: string[] = [];
    for (let i = 0; i < CONCURRENT; i++) concurrentInvoiceIds.push(await createDraft());
    const v2ConcurrentResults = await Promise.all(
      concurrentInvoiceIds.map((invoiceId) => timedCheckoutSettled(invoiceId, '/v2/pos/checkout')),
    );
    const v2ConcurrentOk = v2ConcurrentResults.filter((r) => r.ok);
    // eslint-disable-next-line no-console
    console.log(`[T-03-09] v2 concurrent: ${v2ConcurrentOk.length}/${CONCURRENT} succeeded`);
    const v2Concurrent = summarize(
      'v2 concurrent (10 on one branch)',
      v2ConcurrentOk.map((r) => r.durationMs),
    );

    const v1ConcurrentInvoiceIds: string[] = [];
    for (let i = 0; i < CONCURRENT; i++) v1ConcurrentInvoiceIds.push(await createDraft());
    const v1ConcurrentResults = await Promise.all(
      v1ConcurrentInvoiceIds.map((invoiceId) => timedCheckoutSettled(invoiceId, `/invoices/${invoiceId}/checkout`)),
    );
    const v1ConcurrentOk = v1ConcurrentResults.filter((r) => r.ok);
    // eslint-disable-next-line no-console
    console.log(
      `[T-03-09] v1 concurrent: ${v1ConcurrentOk.length}/${CONCURRENT} succeeded ` +
        `(v1's own SERIALIZABLE numbering genuinely rejects some concurrent requests — bug (a))`,
    );
    const v1Concurrent = summarize(
      'v1 concurrent (10 on one branch)',
      v1ConcurrentOk.map((r) => r.durationMs),
    );

    // Non-functional requirement: v2's p95 must not be worse than v1's by
    // more than 50%, both sequential and concurrent.
    // eslint-disable-next-line no-console
    console.log(
      `[T-03-09] sequential p95 ratio (v2/v1): ${(v2Seq.p95 / v1Seq.p95).toFixed(2)}x — ` +
        `concurrent p95 ratio (v2/v1): ${(v2Concurrent.p95 / v1Concurrent.p95).toFixed(2)}x`,
    );
  }, 300_000);
});
