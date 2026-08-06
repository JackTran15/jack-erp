import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';

export enum CheckoutSagaStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  COMPENSATED = 'COMPENSATED',
  FAILED = 'FAILED',
}

/**
 * State of a single `POST /v2/pos/checkout` attempt. The whole checkout runs in
 * one ACID transaction (see 03-logical-design.md); this row records the
 * outcome for observability and idempotent replay.
 *
 * The unique index is PARTIAL — `WHERE status <> 'FAILED'` — on purpose: a
 * FAILED attempt must not block a retry with the same key, and a failed run is
 * recorded by a *second* transaction after the main one has rolled back (see
 * ADR-01), so several FAILED rows can exist for one key. See A-13.
 */
@Entity('checkout_saga')
@Index('IDX_checkout_saga_org_status', ['organizationId', 'status'])
@Index('IDX_checkout_saga_invoice', ['invoiceId'])
@Index('UQ_checkout_saga_idem', ['organizationId', 'idempotencyKey'], {
  unique: true,
  where: `"status" <> 'FAILED'`,
})
export class CheckoutSagaEntity extends BaseEntity {
  /** Defaults to the invoice id when the client sends no `x-idempotency-key` (A-13). */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey: string;

  /** From `x-request-id`, so a saga row can be traced back to the HTTP request that created it. */
  @Column({ name: 'correlation_id', type: 'varchar', length: 200, nullable: true })
  correlationId?: string;

  @Column({ name: 'invoice_id', type: 'uuid', nullable: true })
  invoiceId?: string;

  @Column({ name: 'document_number', type: 'varchar', length: 64, nullable: true })
  documentNumber?: string;

  @Column({
    type: 'enum',
    enum: CheckoutSagaStatus,
    enumName: 'checkout_saga_status_enum',
    default: CheckoutSagaStatus.PENDING,
  })
  status: CheckoutSagaStatus;

  @Column({ name: 'current_step', type: 'varchar', length: 64, nullable: true })
  currentStep?: string;

  @Column({ name: 'total_steps', type: 'integer', nullable: true })
  totalSteps?: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt?: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ type: 'jsonb', nullable: true })
  error?: Record<string, unknown>;
}
