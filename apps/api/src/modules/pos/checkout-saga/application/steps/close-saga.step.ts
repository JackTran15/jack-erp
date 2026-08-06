import { Injectable } from '@nestjs/common';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import {
  CheckoutSagaEntity,
  CheckoutSagaStatus,
} from '../../infrastructure/checkout-saga.entity';
import { CheckoutSagaStepEntity } from '../../infrastructure/checkout-saga-step.entity';

/**
 * The last transactional step: marks the saga COMPLETED and flushes the
 * whole trail — in the same transaction as everything else, so a client
 * reading `GET /v2/pos/checkout/sagas/:id` right after a 2xx never sees a
 * saga row that hasn't caught up with its own trail.
 *
 * Its own row is a special case: the orchestrator only appends a step's trace
 * record *after* `execute()` returns, which is too late for this step to
 * persist itself that way — so it measures its own elapsed time and builds
 * that row by hand, appended after everything `ctx.trace` already holds.
 */
@Injectable()
export class CloseSagaStep implements CheckoutStep {
  readonly name = 'close-saga';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    if (ctx.replayed) return;

    const startedAt = new Date();
    const manager = requireManager(ctx, this.name);
    const trace = ctx.trace;
    if (!ctx.sagaId || !trace) {
      throw new Error(
        'close-saga ran before open-saga populated the context',
      );
    }

    const sagaRepo = manager.getRepository(CheckoutSagaEntity);
    const stepRepo = manager.getRepository(CheckoutSagaStepEntity);

    const saga = await sagaRepo.findOneOrFail({ where: { id: ctx.sagaId } });
    const ownDurationMs = Date.now() - startedAt.getTime();

    saga.status = CheckoutSagaStatus.COMPLETED;
    saga.invoiceId = ctx.invoice?.id;
    saga.documentNumber = ctx.documentNumber;
    saga.currentStep = this.name;
    saga.totalSteps = trace.length + 1;
    saga.durationMs = trace.totalDurationMs() + ownDurationMs;
    saga.finishedAt = new Date();
    await sagaRepo.save(saga);

    const rows = trace.entries.map((entry) =>
      stepRepo.create({
        sagaId: saga.id,
        seq: entry.seq,
        name: entry.name,
        phase: entry.phase,
        status: entry.status,
        startedAt: entry.startedAt,
        durationMs: entry.durationMs,
        output: entry.output,
        error: entry.error,
      }),
    );
    rows.push(
      stepRepo.create({
        sagaId: saga.id,
        seq: trace.length + 1,
        name: this.name,
        phase: this.phase,
        status: 'OK',
        startedAt,
        durationMs: ownDurationMs,
      }),
    );
    await stepRepo.save(rows);
  }
}
