import { BadRequestException, HttpException, Logger } from '@nestjs/common';
import { CheckoutSagaOrchestrator } from './checkout-saga.orchestrator';
import {
  CheckoutContext,
  CheckoutFailureRecorder,
  CheckoutStep,
  CheckoutStepLogger,
  CheckoutTrace,
  CheckoutWsEmitter,
} from './checkout-step';

/**
 * Official spec for T-01-09 (preflight) and T-02-01 (transactional phase +
 * post-rollback trail recording, ADR-01). Unlike checkout-invoice.service.spec.ts
 * (765 lines, mocks dataSource.transaction so a real rollback never runs — the
 * reason the eight bugs in 00-intent.md survived undetected), this spec is
 * meant to prove the orchestrator's actual control flow: a failing step really
 * stops the ones after it, and a failed transactional run still leaves a
 * FAILED saga row behind via the failure recorder.
 */

const noopLogger: CheckoutStepLogger = {
  stepFinished: () => undefined,
  runRolledBack: () => undefined,
};

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'corr-1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    sagaId: 'saga-1',
    ...overrides,
  };
}

/** A fake manager distinct from `undefined`, so ctx.manager assignment is observable. */
const fakeManager = { __fake: 'manager' } as any;

const noopWsEmitter: CheckoutWsEmitter = { emit: () => undefined };

function makeOrchestrator(opts: {
  logger?: CheckoutStepLogger;
  failureRecorder?: CheckoutFailureRecorder;
  transaction?: jest.Mock;
  dispatchNow?: jest.Mock;
  wsEmitter?: CheckoutWsEmitter;
} = {}): {
  orchestrator: CheckoutSagaOrchestrator;
  failureRecorder: CheckoutFailureRecorder;
  transaction: jest.Mock;
  dispatchNow: jest.Mock;
} {
  const failureRecorder = opts.failureRecorder ?? { record: jest.fn() };
  const transaction =
    opts.transaction ??
    jest.fn(async (cb: (manager: unknown) => Promise<void>) => cb(fakeManager));
  const dispatchNow = opts.dispatchNow ?? jest.fn();
  const dataSource = { transaction } as any;
  const outboxRelay = { dispatchNow } as any;

  const orchestrator = new CheckoutSagaOrchestrator(
    opts.logger ?? noopLogger,
    failureRecorder,
    dataSource,
    outboxRelay,
    opts.wsEmitter ?? noopWsEmitter,
  );
  return { orchestrator, failureRecorder, transaction, dispatchNow };
}

async function captureError(run: Promise<void>): Promise<HttpException> {
  try {
    await run;
  } catch (e) {
    return e as HttpException;
  }
  throw new Error('expected the run to reject, but it resolved');
}

function step(name: string, spy: jest.Mock, throws?: Error, phase: 'preflight' | 'transactional' = 'preflight'): CheckoutStep {
  return {
    name,
    phase,
    execute: async (c) => {
      spy(c);
      if (throws) throw throws;
    },
  };
}

describe('CheckoutSagaOrchestrator — preflight (T-01-09)', () => {
  it('stops at the failing step and does not run the ones after it', async () => {
    const calls = [1, 2, 3, 4].map(() => jest.fn());
    const boom = new BadRequestException({ code: 'CASH_FUND_NOT_CONFIGURED' });
    const steps = [
      step('s1', calls[0]),
      step('s2', calls[1]),
      step('s3', calls[2], boom),
      step('s4', calls[3]),
    ];
    const trace = new CheckoutTrace();
    const { orchestrator } = makeOrchestrator();

    await expect(
      orchestrator.runPreflight(steps, ctx(), trace),
    ).rejects.toBeInstanceOf(HttpException);

    expect(calls[0]).toHaveBeenCalled();
    expect(calls[1]).toHaveBeenCalled();
    expect(calls[2]).toHaveBeenCalled();
    expect(calls[3]).not.toHaveBeenCalled();

    expect(trace.length).toBe(3);
    expect(trace.entries.map((e) => e.status)).toEqual(['OK', 'OK', 'FAILED']);
    expect(trace.entries[2].name).toBe('s3');
    expect(trace.entries[2].error).toBe('CASH_FUND_NOT_CONFIGURED');
    expect(trace.entries.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('keeps the original HTTP status and attaches sagaId + failedStep', async () => {
    const boom = new BadRequestException({ code: 'PAYMENT_INVALID' });
    const steps = [step('compute-totals', jest.fn(), boom)];
    const { orchestrator } = makeOrchestrator();

    const err = await captureError(
      orchestrator.runPreflight(steps, ctx(), new CheckoutTrace()),
    );

    expect(err.getStatus()).toBe(400);
    expect(err.getResponse()).toMatchObject({
      code: 'PAYMENT_INVALID',
      sagaId: 'saga-1',
      failedStep: 'compute-totals',
    });
  });

  it('turns a non-HTTP defect into a 500 without inventing a step-specific code', async () => {
    const steps = [step('post-journal', jest.fn(), new Error('connection lost'))];
    const { orchestrator } = makeOrchestrator();

    const err = await captureError(
      orchestrator.runPreflight(steps, ctx(), new CheckoutTrace()),
    );

    expect(err.getStatus()).toBe(500);
    expect(err.getResponse()).toMatchObject({
      code: 'CHECKOUT_FAILED',
      message: 'connection lost',
      failedStep: 'post-journal',
    });
  });

  it('skips transactional steps when running the preflight phase', async () => {
    const preflightSpy = jest.fn();
    const transactionalSpy = jest.fn();
    const steps: CheckoutStep[] = [
      step('load-draft', preflightSpy),
      step('persist-invoice', transactionalSpy, undefined, 'transactional'),
    ];
    const trace = new CheckoutTrace();
    const { orchestrator } = makeOrchestrator();

    await orchestrator.runPreflight(steps, ctx(), trace);

    expect(preflightSpy).toHaveBeenCalled();
    expect(transactionalSpy).not.toHaveBeenCalled();
    expect(trace.length).toBe(1);
  });

  it('reports totalSteps as the whole list, not just the phase being run', async () => {
    const seen: Array<[number, number]> = [];
    const logger: CheckoutStepLogger = {
      stepFinished: (_c, record, totalSteps) =>
        seen.push([record.seq, totalSteps]),
      runRolledBack: () => undefined,
    };
    const steps: CheckoutStep[] = [
      step('a', jest.fn()),
      step('b', jest.fn()),
      step('c', jest.fn(), undefined, 'transactional'),
    ];
    const { orchestrator } = makeOrchestrator({ logger });

    await orchestrator.runPreflight(steps, ctx(), new CheckoutTrace());

    expect(seen).toEqual([
      [1, 3],
      [2, 3],
    ]);
  });

  it('notifies the logger of the rollback with the trace and total step count', async () => {
    const rolledBack = jest.fn();
    const logger: CheckoutStepLogger = {
      stepFinished: () => undefined,
      runRolledBack: rolledBack,
    };
    const boom = new Error('boom');
    const steps = [step('a', jest.fn()), step('b', jest.fn(), boom)];
    const { orchestrator } = makeOrchestrator({ logger });

    await orchestrator
      .runPreflight(steps, ctx(), new CheckoutTrace())
      .catch(() => undefined);

    expect(rolledBack).toHaveBeenCalledTimes(1);
    const [, trace, totalSteps] = rolledBack.mock.calls[0];
    expect(trace.length).toBe(2);
    expect(totalSteps).toBe(2);
  });
});

describe('CheckoutSagaOrchestrator — transactional phase (T-02-01, ADR-01)', () => {
  it('stops after the step that sets ctx.replayed (T-02-02: open-saga replay), and still commits harmlessly', async () => {
    const after = jest.fn();
    const steps: CheckoutStep[] = [
      {
        name: 'open-saga',
        phase: 'transactional',
        execute: async (c) => {
          c.replayed = true;
        },
      },
      step('persist-invoice', after, undefined, 'transactional'),
    ];
    const { orchestrator, transaction, dispatchNow } = makeOrchestrator();

    await orchestrator.runTransactional(steps, ctx(), new CheckoutTrace());

    expect(after).not.toHaveBeenCalled();
    expect(transaction).toHaveBeenCalledTimes(1); // still commits — nothing to roll back
    expect(dispatchNow).toHaveBeenCalledTimes(1);
  });

  it('opens one transaction, assigns ctx.manager for transactional steps, and clears it after commit', async () => {
    const seenManagers: unknown[] = [];
    const steps: CheckoutStep[] = [
      step('open-saga', jest.fn(), undefined, 'transactional'),
      {
        name: 'persist-invoice',
        phase: 'transactional',
        execute: async (c) => {
          seenManagers.push(c.manager);
        },
      },
    ];
    const c = ctx();
    const { orchestrator, transaction } = makeOrchestrator();

    await orchestrator.runTransactional(steps, c, new CheckoutTrace());

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(seenManagers).toEqual([fakeManager]);
    expect(c.manager).toBeUndefined();
  });

  it('on success, does not call the failure recorder and dispatches the outbox relay once', async () => {
    const steps: CheckoutStep[] = [
      step('close-saga', jest.fn(), undefined, 'transactional'),
    ];
    const { orchestrator, failureRecorder, dispatchNow } = makeOrchestrator();

    await orchestrator.runTransactional(steps, ctx(), new CheckoutTrace());

    expect(failureRecorder.record).not.toHaveBeenCalled();
    expect(dispatchNow).toHaveBeenCalledTimes(1);
  });

  describe('OUTBOX_RELAY_DISABLED (T-03-06)', () => {
    const original = process.env.OUTBOX_RELAY_DISABLED;
    afterEach(() => {
      if (original === undefined) delete process.env.OUTBOX_RELAY_DISABLED;
      else process.env.OUTBOX_RELAY_DISABLED = original;
    });

    it('skips dispatchNow when OUTBOX_RELAY_DISABLED=1 — dispatchNow/pollOnce themselves stay reachable for crash-recovery tests, only this automatic post-commit call is gated', async () => {
      process.env.OUTBOX_RELAY_DISABLED = '1';
      const steps: CheckoutStep[] = [step('close-saga', jest.fn(), undefined, 'transactional')];
      const { orchestrator, dispatchNow } = makeOrchestrator();

      await orchestrator.runTransactional(steps, ctx(), new CheckoutTrace());

      expect(dispatchNow).not.toHaveBeenCalled();
    });

    it('still dispatches when the flag is unset (default/production behaviour unchanged)', async () => {
      delete process.env.OUTBOX_RELAY_DISABLED;
      const steps: CheckoutStep[] = [step('close-saga', jest.fn(), undefined, 'transactional')];
      const { orchestrator, dispatchNow } = makeOrchestrator();

      await orchestrator.runTransactional(steps, ctx(), new CheckoutTrace());

      expect(dispatchNow).toHaveBeenCalledTimes(1);
    });
  });

  it('on failure, rolls back (rethrows), records the FAILED trail once, and clears ctx.manager', async () => {
    const boom = new BadRequestException({ code: 'ACCOUNT_NOT_CONFIGURED' });
    const steps: CheckoutStep[] = [
      step('resolve-accounts-writeback', jest.fn(), boom, 'transactional'),
    ];
    const c = ctx();
    const { orchestrator, failureRecorder, dispatchNow } = makeOrchestrator();

    const err = await captureError(
      orchestrator.runTransactional(steps, c, new CheckoutTrace()),
    );

    expect(err.getResponse()).toMatchObject({ code: 'ACCOUNT_NOT_CONFIGURED' });
    expect(failureRecorder.record).toHaveBeenCalledTimes(1);
    const [recordedCtx, recordedTrace, recordedError] = (
      failureRecorder.record as jest.Mock
    ).mock.calls[0];
    expect(recordedCtx).toBe(c);
    expect(recordedTrace.length).toBe(1);
    expect(recordedError).toBe(err); // the already-decorated error, not the raw one
    expect(c.manager).toBeUndefined();
    expect(dispatchNow).not.toHaveBeenCalled();
  });

  it('when the failure recorder itself throws, the client still gets the original error, plus a warn log', async () => {
    const warnSpy = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const boom = new BadRequestException({ code: 'CASH_FUND_NOT_CONFIGURED' });
    const steps: CheckoutStep[] = [
      step('post-cash', jest.fn(), boom, 'transactional'),
    ];
    const failureRecorder: CheckoutFailureRecorder = {
      record: jest.fn().mockRejectedValue(new Error('db is down')),
    };
    const { orchestrator } = makeOrchestrator({ failureRecorder });

    const err = await captureError(
      orchestrator.runTransactional(steps, ctx(), new CheckoutTrace()),
    );

    expect(err.getResponse()).toMatchObject({ code: 'CASH_FUND_NOT_CONFIGURED' });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('db is down');

    warnSpy.mockRestore();
  });

  it('run(): dryRun stops after preflight and never opens a transaction', async () => {
    const preflight = jest.fn();
    const transactional = jest.fn();
    const steps: CheckoutStep[] = [
      step('load-draft', preflight),
      step('persist-invoice', transactional, undefined, 'transactional'),
    ];
    const { orchestrator, transaction } = makeOrchestrator();

    await orchestrator.run(steps, ctx({ dryRun: true }), new CheckoutTrace());

    expect(preflight).toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(transactional).not.toHaveBeenCalled();
  });

  it('run(): a real (non-dryRun) run executes both phases in order', async () => {
    const order: string[] = [];
    const steps: CheckoutStep[] = [
      step('load-draft', jest.fn(() => order.push('load-draft'))),
      step('persist-invoice', jest.fn(() => order.push('persist-invoice')), undefined, 'transactional'),
    ];
    const { orchestrator, transaction } = makeOrchestrator();

    await orchestrator.run(steps, ctx(), new CheckoutTrace());

    expect(order).toEqual(['load-draft', 'persist-invoice']);
    expect(transaction).toHaveBeenCalledTimes(1);
  });
});

describe('CheckoutSagaOrchestrator — WS notification (T-03-05)', () => {
  it('emits after a successful commit, once dispatchNow has already run', async () => {
    const order: string[] = [];
    const dispatchNow = jest.fn(() => order.push('dispatchNow'));
    const wsEmitter: CheckoutWsEmitter = { emit: jest.fn(() => order.push('emit')) };
    const steps: CheckoutStep[] = [step('persist-invoice', jest.fn(), undefined, 'transactional')];
    const { orchestrator } = makeOrchestrator({ dispatchNow, wsEmitter });

    await orchestrator.runTransactional(steps, ctx(), new CheckoutTrace());

    expect(order).toEqual(['dispatchNow', 'emit']);
    expect(wsEmitter.emit).toHaveBeenCalledTimes(1);
  });

  it('never emits when the transaction fails', async () => {
    const boom = new BadRequestException({ code: 'CASH_FUND_NOT_CONFIGURED' });
    const wsEmitter: CheckoutWsEmitter = { emit: jest.fn() };
    const steps: CheckoutStep[] = [step('post-cash', jest.fn(), boom, 'transactional')];
    const { orchestrator } = makeOrchestrator({ wsEmitter });

    await captureError(orchestrator.runTransactional(steps, ctx(), new CheckoutTrace()));

    expect(wsEmitter.emit).not.toHaveBeenCalled();
  });

  it('a throwing emitter is swallowed with a warn log — never fails an already-committed checkout', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const wsEmitter: CheckoutWsEmitter = {
      emit: () => {
        throw new Error('socket gateway not ready');
      },
    };
    const steps: CheckoutStep[] = [step('persist-invoice', jest.fn(), undefined, 'transactional')];
    const { orchestrator } = makeOrchestrator({ wsEmitter });

    await expect(
      orchestrator.runTransactional(steps, ctx(), new CheckoutTrace()),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain('socket gateway not ready');

    warnSpy.mockRestore();
  });
});
