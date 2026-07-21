import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum DepositPeriodLockStatus {
  LOCKED = 'LOCKED',
  UNLOCKED = 'UNLOCKED',
}

/** Per-account closing balance recorded when a period is locked (BR-LOCK-03). */
export interface PeriodClosingBalanceSnapshot {
  depositAccountId: string;
  closingBalance: number;
  bookBalance: number;
  availableBalance: number;
}

/**
 * Period close for the deposit fund (YYYY-MM per branch, FR-12, TKT-DFR-01/06).
 * Maps `deposit_period_lock` exactly (1786700000000-DepositReconLockAudit).
 */
@Entity('deposit_period_lock')
@Index('UQ_deposit_period_lock', ['organizationId', 'branchId', 'period'], { unique: true })
export class DepositPeriodLockEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  /** YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  period: string;

  @Column({
    type: 'enum',
    enum: DepositPeriodLockStatus,
    enumName: 'deposit_period_lock_status_enum',
    default: DepositPeriodLockStatus.LOCKED,
  })
  status: DepositPeriodLockStatus;

  @Column({ name: 'closing_balance_snapshot', type: 'jsonb' })
  closingBalanceSnapshot: PeriodClosingBalanceSnapshot[];

  @Column({ name: 'locked_by', type: 'varchar' })
  lockedBy: string;

  @Column({ name: 'locked_at', type: 'timestamptz' })
  lockedAt: Date;

  @Column({ name: 'unlocked_by', type: 'varchar', nullable: true })
  unlockedBy?: string;

  @Column({ name: 'unlocked_at', type: 'timestamptz', nullable: true })
  unlockedAt?: Date;

  @Column({ name: 'unlock_reason', type: 'text', nullable: true })
  unlockReason?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
