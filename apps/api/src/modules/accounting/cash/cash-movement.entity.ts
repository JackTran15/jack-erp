import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { CashAccountEntity } from './cash-account.entity';

export enum CashMovementType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  TRANSFER = 'TRANSFER',
  ADJUSTMENT = 'ADJUSTMENT',
}

@Entity('cash_movements')
@Index('idx_cash_movement_account', ['cashAccountId'])
@Index('idx_cash_movement_org_branch', ['organizationId', 'branchId'])
export class CashMovementEntity extends BaseEntity {
  @Column({ name: 'cash_account_id', type: 'uuid' })
  cashAccountId: string;

  @ManyToOne(() => CashAccountEntity)
  @JoinColumn({ name: 'cash_account_id' })
  cashAccount: CashAccountEntity;

  @Column({
    type: 'enum',
    enum: CashMovementType,
  })
  type: CashMovementType;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  amount: number;

  @Column({ length: 255, nullable: true })
  reference?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
