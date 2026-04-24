import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('pos_session_reconciliations')
@Index(['organizationId', 'sessionId'], { unique: true })
export class SessionReconciliationEntity extends BaseEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({
    name: 'expected_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  expectedCash: number;

  @Column({
    name: 'actual_cash',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  actualCash: number;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  variance: number;

  @Column({
    name: 'variance_approved',
    type: 'boolean',
    default: false,
  })
  varianceApproved: boolean;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
