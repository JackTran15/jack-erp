import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CheckoutContext,
  CheckoutFailureRecorder,
  CheckoutTrace,
} from '../application/checkout-step';
import { messageOf } from '../application/checkout-saga.orchestrator';
import { CheckoutSagaEntity, CheckoutSagaStatus } from './checkout-saga.entity';
import { CheckoutSagaStepEntity } from './checkout-saga-step.entity';

/**
 * Persists a FAILED saga row + its full step trail in a fresh transaction,
 * after the main checkout transaction has already rolled back (ADR-01).
 *
 * The row `open-saga` inserted inside the failed transaction no longer
 * exists — it rolled back with everything else — so this recreates it rather
 * than updating it. `ctx.sagaId` survives the rollback regardless (it lives
 * on the plain-object context, not inside the DB transaction), so the same id
 * is reused when `open-saga` reached that point; a fresh id is generated only
 * when the run failed before `open-saga` itself ran.
 */
@Injectable()
export class CheckoutSagaFailureRecorder implements CheckoutFailureRecorder {
  constructor(private readonly dataSource: DataSource) {}

  async record(
    ctx: CheckoutContext,
    trace: CheckoutTrace,
    error: unknown,
  ): Promise<void> {
    const sagaId = ctx.sagaId ?? randomUUID();
    const failedStep = trace.failed;

    await this.dataSource.transaction(async (manager) => {
      const sagaRepo = manager.getRepository(CheckoutSagaEntity);
      const stepRepo = manager.getRepository(CheckoutSagaStepEntity);

      const existing = await sagaRepo.findOne({ where: { id: sagaId } });
      const saga =
        existing ??
        sagaRepo.create({
          id: sagaId,
          organizationId: ctx.actor.organizationId,
          branchId: ctx.actor.branchId,
          createdBy: ctx.actor.userId,
          idempotencyKey: ctx.idempotencyKey,
        });

      saga.correlationId = ctx.correlationId;
      saga.invoiceId = ctx.invoice?.id;
      saga.status = CheckoutSagaStatus.FAILED;
      saga.currentStep = failedStep?.name;
      saga.totalSteps = trace.length;
      saga.durationMs = trace.totalDurationMs();
      saga.finishedAt = new Date();
      saga.error = { message: messageOf(error), step: failedStep?.name };
      await sagaRepo.save(saga);

      // Re-persist from the in-memory trace, not from the DB — none of these
      // rows exist anymore after the rollback.
      await stepRepo.delete({ sagaId: saga.id });
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
      await stepRepo.save(rows);
    });
  }
}
