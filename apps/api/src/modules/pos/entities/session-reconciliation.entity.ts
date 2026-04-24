import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** End-of-session cash count reconciliation. Compares expected vs actual cash. Variance requires manager approval. */
@Entity('pos_session_reconciliations')
@Index(['organizationId', 'sessionId'], { unique: true })
export class SessionReconciliationEntity extends BaseEntity {
  @Column({ name: 'session_id', type: 'uuid', comment: 'The session being reconciled' })
  sessionId: string;

  @Column({
    name: 'expected_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'System-calculated expected cash in the register',
  })
  expectedCash: number;

  @Column({
    name: 'actual_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Actual counted cash reported by the cashier',
  })
  actualCash: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Difference: actualCash minus expectedCash (positive = over, negative = short)',
  })
  variance: number;

  @Column({
    name: 'variance_approved',
    type: 'boolean',
    default: false,
    comment: 'Whether a manager has approved the variance',
  })
  varianceApproved: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true, comment: 'Manager who approved the variance' })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true, comment: 'When the variance was approved' })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true, comment: 'Explanation for the variance' })
  notes?: string;
}
