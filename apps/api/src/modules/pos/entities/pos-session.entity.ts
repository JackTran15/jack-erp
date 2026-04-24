import { Entity, Column, Index } from 'typeorm';
import { SessionStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('pos_sessions')
@Index(['organizationId', 'branchId', 'status'])
@Index(['organizationId', 'openedBy', 'createdAt'])
export class PosSessionEntity extends BaseEntity {
  @Column({ name: 'terminal_id', type: 'uuid', nullable: true })
  terminalId?: string;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.OPEN,
  })
  status: SessionStatus;

  @Column({ name: 'opened_by', type: 'uuid' })
  openedBy: string;

  @Column({ name: 'opened_at', type: 'timestamptz' })
  openedAt: Date;

  @Column({ name: 'closed_by', type: 'uuid', nullable: true })
  closedBy?: string;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt?: Date;

  @Column({
    name: 'opening_cash_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  openingCashAmount: number;
}
