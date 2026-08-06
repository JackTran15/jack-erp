import { Logger } from '@nestjs/common';
import { CheckoutTraceLogger } from './checkout-trace.logger';
import { CheckoutContext, CheckoutStepRecord, CheckoutTrace } from '../application/checkout-step';

function ctx(overrides: Partial<CheckoutContext> = {}): CheckoutContext {
  return {
    actor: { userId: 'u1', organizationId: 'o1', roles: [] },
    input: { invoiceId: 'inv-1', payments: [] },
    correlationId: 'req-7c1',
    idempotencyKey: 'inv-1',
    dryRun: false,
    sagaId: '3f2a',
    ...overrides,
  };
}

describe('CheckoutTraceLogger', () => {
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('logs exactly one OK line matching the fixed format', () => {
    const logger = new CheckoutTraceLogger();
    const record: CheckoutStepRecord = {
      seq: 14,
      name: 'deduct-stock',
      phase: 'transactional',
      status: 'OK',
      startedAt: new Date(),
      durationMs: 23,
      output: { lines: 5 },
    };

    logger.stepFinished(ctx(), record, 19);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    const [line] = logSpy.mock.calls[0];
    expect(line).toMatch(
      /^\[checkout-saga\]\[saga=3f2a\]\[corr=req-7c1\]\[step=14\/19 deduct-stock\]\[OK\] 23ms lines=5$/,
    );
  });

  it('logs exactly one FAIL line carrying the error, matching the fixed format', () => {
    const logger = new CheckoutTraceLogger();
    const record: CheckoutStepRecord = {
      seq: 15,
      name: 'post-journal',
      phase: 'transactional',
      status: 'FAILED',
      startedAt: new Date(),
      durationMs: 8,
      error: 'COA_NOT_CONFIGURED',
    };

    logger.stepFinished(ctx(), record, 19);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    const [line] = warnSpy.mock.calls[0];
    expect(line).toMatch(
      /^\[checkout-saga\]\[saga=3f2a\]\[corr=req-7c1\]\[step=15\/19 post-journal\]\[FAIL\] 8ms COA_NOT_CONFIGURED$/,
    );
  });

  it('logs one ROLLBACK summary line naming the failed step and total duration', () => {
    const logger = new CheckoutTraceLogger();
    const trace = new CheckoutTrace();
    trace.record({ seq: 1, name: 'a', phase: 'preflight', status: 'OK', startedAt: new Date(), durationMs: 100 });
    trace.record({
      seq: 15,
      name: 'post-journal',
      phase: 'transactional',
      status: 'FAILED',
      startedAt: new Date(),
      durationMs: 8,
      error: 'COA_NOT_CONFIGURED',
    });

    logger.runRolledBack(ctx(), trace, 19);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const [line] = warnSpy.mock.calls[0];
    expect(line).toMatch(/^\[checkout-saga\]\[saga=3f2a\] ROLLBACK after 15\/19 — 108ms total$/);
  });

  it('omits the trailing kv/error token entirely when there is none, without a dangling space', () => {
    const logger = new CheckoutTraceLogger();
    const record: CheckoutStepRecord = {
      seq: 1,
      name: 'load-draft',
      phase: 'preflight',
      status: 'OK',
      startedAt: new Date(),
      durationMs: 4,
    };

    logger.stepFinished(ctx(), record, 5);

    const [line] = logSpy.mock.calls[0];
    expect(line).toBe('[checkout-saga][saga=3f2a][corr=req-7c1][step=1/5 load-draft][OK] 4ms');
  });
});
