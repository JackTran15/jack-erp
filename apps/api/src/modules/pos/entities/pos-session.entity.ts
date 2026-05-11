import { Entity, Column, Index } from 'typeorm';
import { SessionStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Cashier's working shift on a POS terminal. Must be opened before recording sales. Lifecycle: OPEN → ACTIVE_SALES → CLOSING → CLOSED. */
@Entity('pos_sessions')
@Index(['organizationId', 'branchId', 'status'])
@Index(['organizationId', 'openedBy', 'createdAt'])
export class PosSessionEntity extends BaseEntity {
  @Column({ name: 'terminal_id', type: 'uuid', nullable: true, comment: 'Optional reference to a physical terminal/register device' })
  terminalId?: string;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.OPEN,
    comment: 'Current session lifecycle state (OPEN, ACTIVE_SALES, CLOSING, CLOSED)',
  })
  status: SessionStatus;

  @Column({ name: 'opened_by', type: 'uuid', comment: 'Cashier who opened the session' })
  openedBy: string;

  @Column({ name: 'opened_at', type: 'timestamptz', comment: 'When the session was opened' })
  openedAt: Date;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true, comment: 'User who closed the session' })
  closedBy?: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true, comment: 'When the session was closed' })
  closedAt?: Date;

  @Column({
    name: 'opening_cash_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Cash amount in the register at session start (float/seed money)',
  })
  openingCashAmount: number;

  @Column({
    name: 'cash_account_id',
    type: 'uuid',
    nullable: true,
    comment: 'Cash register/drawer used in this session (required for sessions created after EPIC-009)',
  })
  cashAccountId?: string;
}
