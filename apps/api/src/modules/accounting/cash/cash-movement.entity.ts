import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { CashAccountEntity } from './cash-account.entity';
import { PosSessionEntity } from '../../pos/entities/pos-session.entity';

export enum CashMovementType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

/** Records each deposit, withdrawal, transfer, or adjustment on a cash account. Triggers journal entries. */
@Entity('cash_movements')
@Index('idx_cash_movement_account', ['cashAccountId'])
@Index('idx_cash_movement_org_branch', ['organizationId', 'branchId'])
@Index('idx_cash_movement_to_account', ['toAccountId'])
@Index('idx_cash_movement_session', ['sessionId'])
export class CashMovementEntity extends BaseEntity {
  @Column({ name: 'cash_account_id', type: 'uuid', comment: 'The cash account affected (source for TRANSFER)' })
  cashAccountId: string;

  @ManyToOne(() => CashAccountEntity)
  @JoinColumn({ name: 'cash_account_id' })
  cashAccount: CashAccountEntity;

  @Column({ name: 'to_account_id', type: 'uuid', nullable: true, comment: 'Destination cash account when type=TRANSFER' })
  toAccountId?: string;

  @ManyToOne(() => CashAccountEntity, { nullable: true })
  @JoinColumn({ name: 'to_account_id' })
  toAccount?: CashAccountEntity;

  @Column({
    type: 'enum',
    enum: CashMovementType,
    comment: 'Nature of the cash movement (DEPOSIT, WITHDRAWAL, TRANSFER, ADJUSTMENT)',
  })
  type: CashMovementType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Movement amount (always positive; direction determined by type)',
  })
  amount: number;

  @Column({ length: 255, nullable: true, comment: 'External reference (receipt number, bank slip, etc.)' })
  reference?: string;

  @Column({ type: 'text', nullable: true, comment: 'Free-text notes' })
  notes?: string;

  @Column({ name: 'session_id', type: 'uuid', nullable: true, comment: 'POS session that recorded this movement, if any' })
  sessionId?: string;

  @ManyToOne(() => PosSessionEntity, { nullable: true })
  @JoinColumn({ name: 'session_id' })
  session?: PosSessionEntity;
}
