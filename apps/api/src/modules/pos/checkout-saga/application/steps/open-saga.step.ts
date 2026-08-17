import { ConflictException, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CheckoutContext, CheckoutStep, requireManager } from '../checkout-step';
import { CheckoutSagaEntity, CheckoutSagaStatus } from '../../infrastructure/checkout-saga.entity';
import { InvoiceEntity } from '../../../entities/invoice.entity';

const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * Opens the saga row — the DB-level idempotency guard (ADR-05), stronger
 * than the Redis `IdempotencyInterceptor` (which stores its record only
 * *after* the handler resolves, so it has no in-flight lock at all).
 *
 * The real guard is the partial unique index declared on `CheckoutSagaEntity`
 * (`(organization_id, idempotency_key) WHERE status <> 'FAILED'`), not the
 * `findOne` below — that read only avoids a round trip for the common case.
 * Two concurrent requests can both miss it and both attempt the insert; the
 * loser is caught here via Postgres error code 23505 and turned into 409, the
 * same convention `product-attribute.service.ts` already uses in this repo.
 *
 * COMPLETED for the same key → this is a replay: `ctx.replayed` is set and no
 * later transactional step runs (see the orchestrator's early-exit).
 */
@Injectable()
export class OpenSagaStep implements CheckoutStep {
  readonly name = 'open-saga';
  readonly phase = 'transactional' as const;

  async execute(ctx: CheckoutContext): Promise<void> {
    const manager = requireManager(ctx, this.name);
    const sagaRepo = manager.getRepository(CheckoutSagaEntity);

    const existing = await sagaRepo.findOne({
      where: {
        organizationId: ctx.actor.organizationId,
        idempotencyKey: ctx.idempotencyKey,
      },
      order: { createdAt: 'DESC' },
    });

    if (existing?.status === CheckoutSagaStatus.COMPLETED) {
      ctx.sagaId = existing.id;
      ctx.documentNumber = existing.documentNumber;
      ctx.replayed = true;
      if (existing.invoiceId) {
        ctx.invoice =
          (await manager.getRepository(InvoiceEntity).findOne({
            where: { id: existing.invoiceId },
          })) ?? undefined;
      }
      return;
    }

    if (existing?.status === CheckoutSagaStatus.PENDING) {
      throw new ConflictException({
        code: 'CHECKOUT_IN_PROGRESS',
        message: `A checkout with idempotency key ${ctx.idempotencyKey} is already in progress`,
      });
    }

    const saga = sagaRepo.create({
      organizationId: ctx.actor.organizationId,
      branchId: ctx.actor.branchId,
      createdBy: ctx.actor.userId,
      idempotencyKey: ctx.idempotencyKey,
      correlationId: ctx.correlationId,
      invoiceId: ctx.invoice?.id,
      status: CheckoutSagaStatus.PENDING,
    });

    try {
      const saved = await sagaRepo.save(saga);
      ctx.sagaId = saved.id;
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException({
          code: 'CHECKOUT_IN_PROGRESS',
          message: `A checkout with idempotency key ${ctx.idempotencyKey} is already in progress`,
        });
      }
      throw err;
    }
  }
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err as any).code === POSTGRES_UNIQUE_VIOLATION;
}
