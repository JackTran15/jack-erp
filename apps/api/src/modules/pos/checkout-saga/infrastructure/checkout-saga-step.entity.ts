import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { CheckoutStepPhase, CheckoutStepStatus } from '../application/checkout-step';
import { CheckoutSagaEntity } from './checkout-saga.entity';

/**
 * One row of the per-step trail behind a `CheckoutSagaEntity`. Deliberately not
 * a `BaseEntity`: it carries no tenant scope of its own — it is always read and
 * written through its parent saga, which already carries `organizationId`.
 *
 * Written on success in the same transaction as the saga (step 19, close-saga);
 * on failure it is written by a second transaction after rollback, from the
 * in-memory `CheckoutTrace` (ADR-01) — the rows never survive the failing
 * transaction itself.
 */
@Entity('checkout_saga_step')
@Index('UQ_checkout_saga_step_seq', ['sagaId', 'seq'], { unique: true })
@Index('IDX_checkout_saga_step_saga', ['sagaId'])
export class CheckoutSagaStepEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'saga_id', type: 'uuid' })
  sagaId: string;

  @ManyToOne(() => CheckoutSagaEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'saga_id' })
  saga?: CheckoutSagaEntity;

  @Column({ type: 'integer' })
  seq: number;

  @Column({ type: 'varchar', length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 16 })
  phase: CheckoutStepPhase;

  @Column({ type: 'varchar', length: 16 })
  status: CheckoutStepStatus;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt?: Date;

  @Column({ name: 'duration_ms', type: 'integer', nullable: true })
  durationMs?: number;

  @Column({ type: 'jsonb', nullable: true })
  output?: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error?: string;
}
