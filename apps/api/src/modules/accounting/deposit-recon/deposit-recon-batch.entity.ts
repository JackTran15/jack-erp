import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DepositReconBatchStatus {
  RECONCILED = 'RECONCILED',
  DISCREPANCY = 'DISCREPANCY',
}

/**
 * One bank-statement reconciliation batch (FR-09, TKT-DFR-01/02). Maps
 * `deposit_recon_batch` exactly (1786700000000-DepositReconLockAudit).
 */
@Entity('deposit_recon_batch')
@Index('idx_deposit_recon_batch_scope', ['organizationId', 'branchId', 'depositAccountId'])
export class DepositReconBatchEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({ name: 'deposit_account_id', type: 'uuid' })
  depositAccountId: string;

  @Column({ name: 'batch_number', type: 'varchar', nullable: true })
  batchNumber?: string;

  @Column({ name: 'stmt_from_date', type: 'date' })
  stmtFromDate: string;

  @Column({ name: 'stmt_to_date', type: 'date' })
  stmtToDate: string;

  @Column({ name: 'stmt_total_amount', type: 'numeric', precision: 18, scale: 2 })
  stmtTotalAmount: number;

  @Column({ name: 'system_total_amount', type: 'numeric', precision: 18, scale: 2 })
  systemTotalAmount: number;

  @Column({ name: 'diff_amount', type: 'numeric', precision: 18, scale: 2 })
  diffAmount: number;

  @Column({
    type: 'enum',
    enum: DepositReconBatchStatus,
    enumName: 'deposit_recon_batch_status_enum',
  })
  status: DepositReconBatchStatus;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @Column({ name: 'reconciled_by', type: 'varchar', nullable: true })
  reconciledBy?: string;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
