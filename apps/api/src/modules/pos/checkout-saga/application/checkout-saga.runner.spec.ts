import { CheckoutSagaRunner } from './checkout-saga.runner';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';
import { CheckoutContext, CheckoutStep, CheckoutTrace } from './checkout-step';
import { ClampPointsStep } from './steps/clamp-points.step';
import { ComputeTotalsStep } from './steps/compute-totals.step';
import { InvoicePaymentMethod } from '../../entities/invoice.entity';

/**
 * Preview runs through a *real* orchestrator (its collaborators mocked) so
 * "never opens a transaction" is asserted against the one thing that could
 * open one — `dataSource.transaction` — rather than against a mock of the
 * orchestrator that would pass no matter what the runner did.
 *
 * `clamp-points` and `compute-totals` are the real steps: the first because
 * preview must show clamped points, the second so the parity test compares
 * against the very step checkout runs.
 */

const actor = { userId: 'u1', organizationId: 'o1', branchId: 'b1', roles: [] } as any;

function fakeStep(name: string, impl: (ctx: CheckoutContext) => void = () => undefined) {
  return {
    name,
    phase: 'preflight' as const,
    execute: jest.fn(async (ctx: CheckoutContext) => impl(ctx)),
  };
}

function transactionalStep(name: string) {
  return { name, phase: 'transactional' as const, execute: jest.fn() };
}

interface Draft {
  customerId?: string;
  pointsRedeemed?: number;
  pointsDiscountAmount?: number;
  discountAmount?: number;
  depositAmount?: number;
}

function build(opts: {
  draft: Draft;
  lineTotals: number[];
  promotionDiscount?: number;
  appliedPrograms?: unknown[];
}) {
  const dataSource = { transaction: jest.fn() };
  const orchestrator = new CheckoutSagaOrchestrator(
    { stepFinished: jest.fn(), runRolledBack: jest.fn() },
    { record: jest.fn() },
    dataSource as any,
    { dispatchNow: jest.fn() } as any,
    { emit: jest.fn() },
  );

  const loadDraft = fakeStep('load-draft', (ctx) => {
    ctx.invoice = {
      id: ctx.input.invoiceId,
      discountAmount: 0,
      depositAmount: 0,
      pointsRedeemed: 0,
      pointsDiscountAmount: 0,
      ...opts.draft,
    } as any;
    ctx.items = opts.lineTotals.map((lineTotal, i) => ({
      id: `line-${i}`,
      lineTotal,
      quantity: 1,
      unitPrice: lineTotal,
      lineDiscount: 0,
    })) as any;
  });
  const evaluatePromotion = fakeStep('evaluate-promotion', (ctx) => {
    ctx.promotion = {
      promotionDiscount: opts.promotionDiscount ?? 0,
      appliedPrograms: opts.appliedPrograms ?? [],
      lineDiscounts: [],
    };
  });
  const resolveAccounts = fakeStep('resolve-accounts');
  const resolveFunds = fakeStep('resolve-funds');
  const clampPoints = new ClampPointsStep();
  const computeTotals = new ComputeTotalsStep();
  const computeTotalsSpy = jest.spyOn(computeTotals, 'execute');
  const tx = [
    'open-saga', 'lock-invoice', 'next-document-number', 'redeem-voucher',
    'persist-invoice', 'persist-payments', 'create-debt', 'redeem-points',
    'deduct-stock', 'post-journal', 'post-cash', 'post-deposit',
    'enqueue-outbox', 'close-saga',
  ].map(transactionalStep);

  // Constructor order mirrors allSteps(); the transactional tail is 14 inert fakes.
  const Runner = CheckoutSagaRunner as unknown as new (...args: unknown[]) => CheckoutSagaRunner;
  const runner = new Runner(
    orchestrator,
    loadDraft,
    evaluatePromotion,
    resolveAccounts,
    resolveFunds,
    clampPoints,
    computeTotals,
    ...tx,
  );

  return {
    runner,
    orchestrator,
    dataSource,
    loadDraft,
    evaluatePromotion,
    resolveAccounts,
    resolveFunds,
    computeTotals,
    computeTotalsSpy,
    tx,
  };
}

describe('CheckoutSagaRunner.preview', () => {
  it('prices a walk-in sale with no payments without opening a transaction or throwing PAYMENT_INVALID', async () => {
    const h = build({ draft: {}, lineTotals: [685_000, 100_000], promotionDiscount: 85_000 });

    const preview = await h.runner.preview({ invoiceId: 'inv-1' }, actor);

    expect(preview.totals).toEqual({
      subtotal: 785_000,
      manualDiscountAmount: 0,
      promotionDiscount: 85_000,
      pointsRedeemed: 0,
      pointsDiscountAmount: 0,
      depositAmount: 0,
      amountDue: 700_000,
      // Walk-in: persist-invoice would store 0, so preview must not promise 70.
      pointsEarned: 0,
    });
    expect(h.dataSource.transaction).not.toHaveBeenCalled();
    expect(h.computeTotalsSpy).not.toHaveBeenCalled();
    expect(h.resolveAccounts.execute).not.toHaveBeenCalled();
    expect(h.resolveFunds.execute).not.toHaveBeenCalled();
    for (const step of h.tx) expect(step.execute).not.toHaveBeenCalled();
  });

  it('is meaningful: the same walk-in, no-payment context DOES make compute-totals throw PAYMENT_INVALID', async () => {
    const h = build({ draft: {}, lineTotals: [685_000, 100_000], promotionDiscount: 85_000 });
    const ctx: CheckoutContext = {
      actor,
      input: { invoiceId: 'inv-1', payments: [] },
      correlationId: 'c',
      idempotencyKey: 'k',
      dryRun: true,
    };
    await h.loadDraft.execute(ctx);
    await h.evaluatePromotion.execute(ctx);

    await expect(new ComputeTotalsStep().execute(ctx)).rejects.toMatchObject({
      response: { code: 'PAYMENT_INVALID' },
    });
  });

  it('shows the clamped points, and matches compute-totals to the đồng for the same sale', async () => {
    // 580,000 cart, 116,000 promotion, 1,000 points requested (worth 500,000)
    // against 464,000 left → clamp-points caps it at 928 points.
    const draft = { customerId: 'cus-1', pointsRedeemed: 1000, pointsDiscountAmount: 500_000 };
    const h = build({ draft, lineTotals: [580_000], promotionDiscount: 116_000 });

    const preview = await h.runner.preview({ invoiceId: 'inv-1' }, actor);

    expect(preview.totals.pointsRedeemed).toBe(928);
    expect(preview.totals.pointsDiscountAmount).toBe(464_000);

    // Parity: run the checkout's own preflight on the same draft, fully paid.
    const other = build({ draft: { ...draft }, lineTotals: [580_000], promotionDiscount: 116_000 });
    const ctx: CheckoutContext = {
      actor,
      input: {
        invoiceId: 'inv-1',
        payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: preview.totals.amountDue }],
      },
      correlationId: 'c',
      idempotencyKey: 'k',
      dryRun: true,
    };
    await other.loadDraft.execute(ctx);
    await other.evaluatePromotion.execute(ctx);
    await new ClampPointsStep().execute(ctx);
    await new ComputeTotalsStep().execute(ctx);
    const t = ctx.totals!;
    expect(preview.totals).toMatchObject({
      subtotal: t.subtotal,
      manualDiscountAmount: t.manualDiscountAmount,
      promotionDiscount: t.promotionDiscount,
      pointsDiscountAmount: t.pointsDiscountAmount,
      depositAmount: t.depositAmount,
      amountDue: t.amountDue,
      pointsEarned: t.pointsEarned,
    });
  });

  it('gives no points when an applied programme blocks accrual (ADR-02), even with a customer', async () => {
    const h = build({
      draft: { customerId: 'cus-1' },
      lineTotals: [1_000_000],
      promotionDiscount: 100_000,
      appliedPrograms: [{ programId: 'p1', accruePoints: false }],
    });

    const preview = await h.runner.preview({ invoiceId: 'inv-1' }, actor);

    expect(preview.totals.amountDue).toBe(900_000);
    expect(preview.totals.pointsEarned).toBe(0);
    expect(preview.appliedPrograms).toEqual([{ programId: 'p1', accruePoints: false }]);
  });

  it('credits points for a customer sale with no blocking programme', async () => {
    const h = build({ draft: { customerId: 'cus-1' }, lineTotals: [1_000_000] });
    const preview = await h.runner.preview({ invoiceId: 'inv-1' }, actor);
    expect(preview.totals.pointsEarned).toBe(100);
  });

  it('forwards the programme selection and uses an idempotency key no saga can hold', async () => {
    const h = build({ draft: {}, lineTotals: [100_000] });

    await h.runner.preview(
      { invoiceId: 'inv-9', selectedProgramIds: ['a'], excludedProgramIds: ['b'] },
      actor,
    );

    const seen = h.evaluatePromotion.execute.mock.calls[0][0] as CheckoutContext;
    expect(seen.input).toEqual({
      invoiceId: 'inv-9',
      payments: [],
      selectedProgramIds: ['a'],
      excludedProgramIds: ['b'],
    });
    // Never the bare invoiceId (checkout's default key) — otherwise load-draft
    // would let an already-completed invoice through as a "replay".
    expect(seen.idempotencyKey).toBe('preview:inv-9');
    expect(seen.dryRun).toBe(true);
  });

  it('surfaces a step failure in the same decorated shape checkout gives', async () => {
    const h = build({ draft: {}, lineTotals: [100_000] });
    const { BadRequestException } = await import('@nestjs/common');
    h.loadDraft.execute.mockRejectedValueOnce(
      new BadRequestException({ code: 'INVOICE_NOT_CHECKOUTABLE' }),
    );

    const err = await h.runner.preview({ invoiceId: 'inv-1' }, actor).catch((e) => e);

    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({
      code: 'INVOICE_NOT_CHECKOUTABLE',
      failedStep: 'load-draft',
    });
    expect(h.dataSource.transaction).not.toHaveBeenCalled();
  });
});

describe('CheckoutSagaRunner.run', () => {
  it('runs all 20 steps via orchestrator.run and returns the controller-shaped result', async () => {
    const h = build({ draft: {}, lineTotals: [100_000] });
    const run = jest
      .spyOn(h.orchestrator, 'run')
      .mockImplementation(
        async (stepList: readonly CheckoutStep[], ctx: CheckoutContext, trace: CheckoutTrace, totalSteps?: number) => {
          expect(stepList.map((s) => s.name)).toEqual([
            'load-draft', 'evaluate-promotion', 'resolve-accounts', 'resolve-funds',
            'clamp-points', 'compute-totals', 'open-saga', 'lock-invoice',
            'next-document-number', 'redeem-voucher', 'persist-invoice',
            'persist-payments', 'create-debt', 'redeem-points', 'deduct-stock',
            'post-journal', 'post-cash', 'post-deposit', 'enqueue-outbox', 'close-saga',
          ]);
          expect(totalSteps).toBe(20);
          expect(ctx.idempotencyKey).toBe('key-1');
          expect(ctx.correlationId).toBe('corr-1');
          expect(ctx.dryRun).toBe(false);
          ctx.invoice = { id: 'inv-1' } as any;
          ctx.sagaId = 'saga-1';
          ctx.documentNumber = 'HD-000001';
          ctx.totals = { amountDue: 200 } as any;
          ctx.promotion = { promotionDiscount: 0, appliedPrograms: [{ programId: 'p1' }], lineDiscounts: [] };
          trace.record({ seq: 1, name: 'load-draft', phase: 'preflight', status: 'OK', startedAt: new Date(), durationMs: 2 });
        },
      );

    const result = await h.runner.run(
      { invoiceId: 'inv-1', payments: [{ paymentMethod: InvoicePaymentMethod.CASH, amount: 200 }] },
      { idempotencyKey: 'key-1', correlationId: 'corr-1' },
      actor,
    );

    expect(run).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      committed: true,
      invoiceId: 'inv-1',
      sagaId: 'saga-1',
      documentNumber: 'HD-000001',
      totals: { amountDue: 200 },
      appliedPrograms: [{ programId: 'p1' }],
      steps: [{ seq: 1, name: 'load-draft', phase: 'preflight', status: 'OK', durationMs: 2 }],
    });
  });

  it('reports committed:false and runs as a dry run only when opts.dryRun is true', async () => {
    const h = build({ draft: {}, lineTotals: [100_000] });
    let seen!: CheckoutContext;
    jest.spyOn(h.orchestrator, 'run').mockImplementation(async (_s, ctx) => {
      seen = ctx;
    });

    const result = await h.runner.run(
      { invoiceId: 'inv-1', payments: [] },
      { idempotencyKey: 'k', correlationId: 'c', dryRun: true },
      actor,
    );

    expect(seen.dryRun).toBe(true);
    expect(result.committed).toBe(false);
    expect(result.appliedPrograms).toEqual([]);
  });
});
