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
import { CashTransferFundKind } from '../../cash-vouchers/enums';

/**
 * Inter-branch cash transfer header (EPIC-21072026) — links the source leg
 * (`from_payment_id` → cash_payments, purpose INTER_BRANCH_OUT) and the
 * destination leg (`to_receipt_id`, set once the destination branch confirms:
 * cash_receipts when `toFundKind` is CASH, bank_receipts when DEPOSIT).
 *
 * Columns are declared explicitly (not extending BaseEntity) because there are
 * two branch scopes (from/to), not one — same reason as DepositTransferEntity.
 *
 * `status` reuses the `deposit_transfer_status` Postgres type and the
 * DepositTransferStatus enum: the lifecycle vocabulary is identical
 * (DANG_CHUYEN / HOAN_TAT / DA_HUY), deliberately not duplicated.
 *
 * Matches the cash_transfer table in 1787300000001-CashTransfer exactly.
 */
@Entity('cash_transfer')
@Index('idx_cash_transfer_org_status', ['organizationId', 'status'])
@Index('idx_cash_transfer_from_branch', ['fromBranchId'])
@Index('idx_cash_transfer_to_branch', ['toBranchId'])
export class CashTransferEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'from_branch_id', type: 'varchar' })
  fromBranchId: string;

  @Column({ name: 'to_branch_id', type: 'varchar' })
  toBranchId: string;

  /** The initiating branch's cash fund (cash_accounts.id). */
  @Column({ name: 'from_cash_account_id', type: 'uuid' })
  fromCashAccountId: string;

  @Column({
    name: 'to_fund_kind',
    type: 'enum',
    enum: CashTransferFundKind,
    enumName: 'cash_transfer_fund_kind',
  })
  toFundKind: CashTransferFundKind;

  /** Destination branch's cash fund; set only when toFundKind is CASH. */
  @Column({ name: 'to_cash_account_id', type: 'uuid', nullable: true })
  toCashAccountId?: string | null;

  /** Destination branch's deposit account; set only when toFundKind is DEPOSIT. */
  @Column({ name: 'to_deposit_account_id', type: 'uuid', nullable: true })
  toDepositAccountId?: string | null;

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

  /** cash_receipts.id or bank_receipts.id, depending on toFundKind. */
  @Column({ name: 'to_receipt_id', type: 'uuid', nullable: true })
  toReceiptId?: string | null;

  /** = id; also written to the destination leg's deposit_movements.transfer_pair_id. */
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
