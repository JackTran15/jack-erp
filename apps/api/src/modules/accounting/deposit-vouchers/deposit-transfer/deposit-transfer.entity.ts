import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DepositTransferStatus } from '@erp/shared-interfaces';

/**
 * Inter-branch deposit transfer header (GĐ4, TKT-DFB-01) — links the source
 * leg (`from_payment_id` → bank_payments, purpose INTER_BRANCH_OUT) and the
 * destination leg (`to_receipt_id` → bank_receipts, purpose INTER_BRANCH_IN,
 * set once B confirms). Columns are declared explicitly (not extending
 * BaseEntity) because there are two branch scopes (from/to), not one. Matches
 * the deposit_transfer table in 1786900000000-DepositTransfer exactly.
 */
@Entity('deposit_transfer')
@Index('idx_deposit_transfer_org_status', ['organizationId', 'status'])
@Index('idx_deposit_transfer_from_branch', ['fromBranchId'])
@Index('idx_deposit_transfer_to_branch', ['toBranchId'])
@Index('idx_deposit_transfer_from_account', ['fromAccountId'])
@Index('idx_deposit_transfer_to_account', ['toAccountId'])
export class DepositTransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'from_branch_id', type: 'varchar' })
  fromBranchId: string;

  @Column({ name: 'to_branch_id', type: 'varchar' })
  toBranchId: string;

  @Column({ name: 'from_account_id', type: 'uuid' })
  fromAccountId: string;

  @Column({ name: 'to_account_id', type: 'uuid' })
  toAccountId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: DepositTransferStatus,
    enumName: 'deposit_transfer_status',
    default: DepositTransferStatus.DANG_CHUYEN,
  })
  status: DepositTransferStatus;

  @Column({ name: 'from_payment_id', type: 'uuid' })
  fromPaymentId: string;

  @Column({ name: 'to_receipt_id', type: 'uuid', nullable: true })
  toReceiptId?: string | null;

  /** = id; also written to both legs' deposit_movements.transfer_pair_id. */
  @Column({ name: 'transfer_pair_id', type: 'uuid' })
  transferPairId: string;

  @Column({ name: 'initiated_by', type: 'varchar' })
  initiatedBy: string;

  @Column({ name: 'initiated_at', type: 'timestamptz' })
  initiatedAt: Date;

  @Column({ name: 'confirmed_by', type: 'varchar', nullable: true })
  confirmedBy?: string | null;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt?: Date | null;

  @Column({ name: 'cancelled_by', type: 'varchar', nullable: true })
  cancelledBy?: string | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date | null;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string | null;

  @Column({ type: 'text', nullable: true })
  note?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
