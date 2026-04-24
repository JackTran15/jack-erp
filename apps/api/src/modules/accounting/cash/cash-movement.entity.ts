import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { CashAccountEntity } from './cash-account.entity';

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
export class CashMovementEntity extends BaseEntity {
  @Column({ name: 'cash_account_id', type: 'uuid', comment: 'The cash account affected' })
  cashAccountId: string;

  @ManyToOne(() => CashAccountEntity)
  @JoinColumn({ name: 'cash_account_id' })
  cashAccount: CashAccountEntity;

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
}
