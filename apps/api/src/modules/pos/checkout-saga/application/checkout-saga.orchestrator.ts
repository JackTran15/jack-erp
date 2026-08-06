import {
  HttpException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { OutboxRelayService } from '../../../events/outbox/outbox-relay.service';
import {
  CHECKOUT_FAILURE_RECORDER,
  CHECKOUT_STEP_LOGGER,
  CHECKOUT_WS_EMITTER,
  CheckoutContext,
  CheckoutFailureRecorder,
  CheckoutStep,
  CheckoutStepLogger,
  CheckoutStepRecord,
  CheckoutTrace,
  CheckoutWsEmitter,
} from './checkout-step';

/**
 * Runs the checkout steps in order and records what happened.
 *
 * This class owns sequencing, timing, the trail, error decoration, and the
 * transaction boundary (ADR-01) — that last one is the reason `DataSource` is
 * a legitimate dependency here, unlike a business repository. It still owns
 * no business rules: no entity repository, no money computation, no reading
 * business tables. Anything of that kind belongs in a step.
 *
 * `runPreflight` and `runStep` predate this file's transactional phase
 * (T-01-03); `runTransactional` and `run` are added by T-02-01.
 */
@Injectable()
export class CheckoutSagaOrchestrator {
  private readonly logger = new Logger(CheckoutSagaOrchestrator.name);

  constructor(
    @Inject(CHECKOUT_STEP_LOGGER)
    private readonly stepLogger: CheckoutStepLogger,
    @Inject(CHECKOUT_FAILURE_RECORDER)
    private readonly failureRecorder: CheckoutFailureRecorder,
    private readonly dataSource: DataSource,
    private readonly outboxRelay: OutboxRelayService,
    @Inject(CHECKOUT_WS_EMITTER)
    private readonly wsEmitter: CheckoutWsEmitter,
  ) {}

  /**
   * Runs preflight, then (unless `ctx.dryRun`) the transactional phase. The
   * one entry point a controller needs.
   */
  async run(
    steps: readonly CheckoutStep[],
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    totalSteps: number = steps.length,
  ): Promise<void> {
    await this.runPreflight(steps, ctx, trace, totalSteps);
    if (ctx.dryRun) return;
    await this.runTransactional(steps, ctx, trace, totalSteps);
  }

  /**
   * Executes every step whose phase is `preflight`, in list order, stopping at
   * the first failure.
   *
   * `totalSteps` is reported as the length of the whole list, not of the phase,
   * so a trail reading `step=3/19` means the same thing whether the run
   * finished or stopped early.
   */
  async runPreflight(
    steps: readonly CheckoutStep[],
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    totalSteps: number = steps.length,
  ): Promise<void> {
    ctx.trace = trace;
    for (const step of steps) {
      if (step.phase !== 'preflight') continue;
      await this.runStep(step, ctx, trace, totalSteps);
    }
  }

  /**
   * Runs one step, timing it and appending exactly one trail record whether it
   * succeeds or fails. On failure the error is decorated and rethrown, so the
   * caller's transaction (once there is one) unwinds normally.
   */
  async runStep(
    step: CheckoutStep,
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    totalSteps: number,
  ): Promise<void> {
    const seq = trace.length + 1;
    const startedAt = new Date();
    const startedHr = process.hrtime.bigint();

    try {
      await step.execute(ctx);
    } catch (error) {
      const record: CheckoutStepRecord = {
        seq,
        name: step.name,
        phase: step.phase,
        status: 'FAILED',
        startedAt,
        durationMs: elapsedMs(startedHr),
        error: messageOf(error),
      };
      trace.record(record);
      this.stepLogger.stepFinished(ctx, record, totalSteps);
      this.stepLogger.runRolledBack(ctx, trace, totalSteps);
      throw decorate(error, ctx.sagaId, step.name);
    }

    const record: CheckoutStepRecord = {
      seq,
      name: step.name,
      phase: step.phase,
      status: 'OK',
      startedAt,
      durationMs: elapsedMs(startedHr),
    };
    trace.record(record);
    this.stepLogger.stepFinished(ctx, record, totalSteps);
  }

  /**
   * Opens one transaction, runs every `transactional` step inside it, and
   * assigns `ctx.manager` for their duration.
   *
   * Success: the transaction commits with the invoice, payments, ledger,
   * journal and outbox rows all in the same COMMIT — `close-saga` (the last
   * transactional step) flushes the trail using that same `manager`, so no
   * second write is needed. `dispatchNow()` runs after commit, purely to
   * shave latency off the outbox relay's normal poll interval.
   *
   * Failure: whatever the failing step already did inside this transaction is
   * rolled back automatically — that is the whole point of ADR-01. The row
   * `open-saga` wrote is gone along with everything else, so a *second*,
   * independent transaction re-persists a FAILED saga row + the full
   * in-memory trail (`recordFailure`), and only then is the original
   * (already `runStep`-decorated) error rethrown unchanged.
   */
  async runTransactional(
    steps: readonly CheckoutStep[],
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    totalSteps: number = steps.length,
  ): Promise<void> {
    ctx.trace = trace;
    try {
      await this.dataSource.transaction(async (manager) => {
        ctx.manager = manager;
        for (const step of steps) {
          if (step.phase !== 'transactional') continue;
          await this.runStep(step, ctx, trace, totalSteps);
          // open-saga (T-02-02) sets this when it finds a COMPLETED saga for
          // the same idempotency key — the run is a replay, so nothing after
          // it should execute. The transaction still commits (harmless: the
          // replay branch writes nothing new).
          if (ctx.replayed) break;
        }
      });
    } catch (error) {
      ctx.manager = undefined;
      await this.recordFailure(ctx, trace, error);
      throw error;
    }
    ctx.manager = undefined;
    // OUTBOX_RELAY_DISABLED only stops the relay's own periodic timer
    // (OutboxRelayService.onApplicationBootstrap) — dispatchNow()/pollOnce()
    // are deliberately left reachable even when disabled, so a crash-recovery
    // test can simulate "relay down" and then trigger a dispatch itself. This
    // orchestrator's automatic post-commit call is a different caller with a
    // different need — respecting the same flag here is what actually gives
    // e2e a fully quiet run (no real Kafka publish/consume round trip per
    // commit), which `dispatchNow()` alone does not provide.
    if (process.env.OUTBOX_RELAY_DISABLED !== '1') {
      this.outboxRelay.dispatchNow();
    }
    this.emitWsNotification(ctx);
  }

  /**
   * Best-effort, same reasoning as `recordFailure`: a dropped WS notification
   * is not a reason to fail an already-committed checkout. Runs only after
   * COMMIT (T-03-05) — never from inside a step, which would show the
   * cashier a "checkout acknowledged" notification for a sale that could
   * still roll back.
   */
  private emitWsNotification(ctx: CheckoutContext): void {
    try {
      this.wsEmitter.emit(ctx);
    } catch (error) {
      this.logger.warn(
        `Failed to emit WS notification for saga ${ctx.sagaId ?? 'unknown'}: ${messageOf(error)}`,
      );
    }
  }

  /**
   * Best-effort: if persisting the FAILED trail itself fails, that is a
   * second problem, not a reason to hide the first. Log and move on — the
   * client still gets the real error either way.
   */
  private async recordFailure(
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    error: unknown,
  ): Promise<void> {
    try {
      await this.failureRecorder.record(ctx, trace, error);
    } catch (recordingError) {
      this.logger.warn(
        `Failed to persist FAILED trail for saga ${ctx.sagaId ?? 'unknown'}: ${messageOf(recordingError)}`,
      );
    }
  }
}

function elapsedMs(startedHr: bigint): number {
  return Number((process.hrtime.bigint() - startedHr) / 1_000_000n);
}

export function messageOf(error: unknown): string {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null) {
      const asRecord = response as Record<string, unknown>;
      const code = asRecord.code;
      if (typeof code === 'string') return code;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Attaches `sagaId` and `failedStep` to the error on its way out, so a caller
 * can look the run up in `GET /v2/pos/checkout/sagas/:id` without grepping logs.
 *
 * An `HttpException` keeps its status and its body: steps own the error
 * taxonomy (see 03-logical-design.md), and the orchestrator must not turn a 409
 * into a 500 on the way past. Anything else is a genuine defect and becomes a
 * 500 — deliberately without a step-specific code, because the orchestrator
 * does not know what any given step means.
 */
function decorate(
  error: unknown,
  sagaId: string | undefined,
  failedStep: string,
): unknown {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    const base =
      typeof response === 'string'
        ? { message: response }
        : { ...(response as Record<string, unknown>) };
    return new HttpException(
      { ...base, sagaId, failedStep },
      error.getStatus(),
      { cause: error },
    );
  }

  return new InternalServerErrorException({
    code: 'CHECKOUT_FAILED',
    message: messageOf(error),
    sagaId,
    failedStep,
  });
}
