import { Injectable, Logger } from '@nestjs/common';
import {
  CheckoutContext,
  CheckoutStepLogger,
  CheckoutStepRecord,
  CheckoutTrace,
} from '../application/checkout-step';

/**
 * Structured, one-line-per-step logging for the checkout saga, using Nest's
 * built-in `Logger` — the repo has no pino/winston/OpenTelemetry and this epic
 * does not add one.
 *
 * Format is fixed on purpose (03-logical-design.md "Observability"), so a spec
 * asserts it with a regex: changing the shape breaks the test rather than
 * drifting silently.
 *
 *   [checkout-saga][saga=<id>][corr=<correlationId>][step=<seq>/<total> <name>][OK] <ms>ms <kv>
 *   [checkout-saga][saga=<id>][corr=<correlationId>][step=<seq>/<total> <name>][FAIL] <ms>ms <error>
 *   [checkout-saga][saga=<id>] ROLLBACK after <seq>/<total> — <ms>ms total
 */
@Injectable()
export class CheckoutTraceLogger implements CheckoutStepLogger {
  private readonly logger = new Logger('checkout-saga');

  stepFinished(
    ctx: CheckoutContext,
    record: CheckoutStepRecord,
    totalSteps: number,
  ): void {
    const head = this.head(ctx, record, totalSteps);
    if (record.status === 'FAILED') {
      this.logger.warn(`${head}[FAIL] ${record.durationMs}ms ${record.error ?? ''}`.trimEnd());
      return;
    }
    this.logger.log(`${head}[OK] ${record.durationMs}ms ${this.kv(record.output)}`.trimEnd());
  }

  runRolledBack(ctx: CheckoutContext, trace: CheckoutTrace, totalSteps: number): void {
    const failed = trace.failed;
    const seq = failed?.seq ?? trace.length;
    this.logger.warn(
      `[checkout-saga][saga=${ctx.sagaId ?? 'unknown'}] ROLLBACK after ${seq}/${totalSteps} — ${trace.totalDurationMs()}ms total`,
    );
  }

  private head(
    ctx: CheckoutContext,
    record: CheckoutStepRecord,
    totalSteps: number,
  ): string {
    return (
      `[checkout-saga][saga=${ctx.sagaId ?? 'unknown'}][corr=${ctx.correlationId}]` +
      `[step=${record.seq}/${totalSteps} ${record.name}]`
    );
  }

  /** Renders a step's small output object as space-separated `key=value` pairs. Never the whole object. */
  private kv(output: Record<string, unknown> | undefined): string {
    if (!output) return '';
    return Object.entries(output)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' ');
  }
}
