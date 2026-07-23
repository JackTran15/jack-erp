import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import {
  BankPaymentPurpose,
  BankPaymentReferenceType,
  BankVoucherPartnerType,
  BankVoucherStatus,
} from '../enums';
import { BankPaymentLineEntity } from './bank-payment-line.entity';

/**
 * Deposit-fund payment voucher (Phiếu chi tiền gửi, UNC). Columns are declared
 * explicitly (not extending BaseEntity) because branch_id is NOT NULL. Matches
 * the bank_payments table in 1786600000000-DepositVouchersSchema exactly. The
 * approval_status / approved_by / approved_at columns are wired but not gated in
 * GĐ2 (BR-CHI-03 stub, OQ-08) — a payment posts directly.
 */
@Entity('bank_payments')
@Index('idx_bank_payments_scope', [
  'organizationId',
  'branchId',
  'depositAccountId',
  'docDate',
  'id',
])
@Index('IDX_bank_payments_movement', ['depositMovementId'])
export class BankPaymentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({ name: 'deposit_account_id', type: 'uuid' })
  depositAccountId: string;

  @Column({ name: 'document_number', type: 'varchar', length: 64, nullable: true })
  documentNumber?: string;

  @Column({
    type: 'enum',
    enum: BankPaymentPurpose,
    enumName: 'bank_payment_purpose_enum',
    default: BankPaymentPurpose.OTHER,
  })
  purpose: BankPaymentPurpose;

  @Column({
    type: 'enum',
    enum: BankVoucherStatus,
    enumName: 'bank_voucher_status_enum',
    default: BankVoucherStatus.DRAFT,
  })
  status: BankVoucherStatus;

  @Column({ name: 'doc_date', type: 'date' })
  docDate: string;

  @Column({
    name: 'partner_type',
    type: 'enum',
    enum: BankVoucherPartnerType,
    enumName: 'bank_voucher_partner_type_enum',
    nullable: true,
  })
  partnerType?: BankVoucherPartnerType;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId?: string;

  @Column({ name: 'partner_name_snapshot', type: 'varchar', length: 255, nullable: true })
  partnerNameSnapshot?: string;

  @Column({ name: 'partner_address_snapshot', type: 'varchar', length: 500, nullable: true })
  partnerAddressSnapshot?: string;

  @Column({ name: 'payee_name', type: 'varchar', length: 255, nullable: true })
  payeeName?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason?: string;

  @Column({ name: 'paid_by', type: 'varchar', nullable: true })
  paidBy?: string;

  /**
   * Resolved from {@link paidBy} on read — not a column. Lets the client show
   * "Nhân viên chi" without calling the permission-gated user endpoint.
   */
  paidByCode?: string | null;
  paidByName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string;

  @Column({ name: 'affect_expense', type: 'boolean', default: false })
  affectExpense: boolean;

  @Column({ name: 'contra_account_id', type: 'uuid', nullable: true })
  contraAccountId?: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => `'[]'::jsonb` })
  attachmentIds: string[];

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: BankPaymentReferenceType,
    enumName: 'bank_payment_reference_type_enum',
    nullable: true,
  })
  referenceType?: BankPaymentReferenceType;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

  @Column({ name: 'approval_status', type: 'varchar', nullable: true })
  approvalStatus?: string;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'deposit_movement_id', type: 'uuid', nullable: true })
  depositMovementId?: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId?: string;

  @Column({ name: 'reverses_voucher_id', type: 'uuid', nullable: true })
  reversesVoucherId?: string;

  @Column({ name: 'reversed_by_voucher_id', type: 'uuid', nullable: true })
  reversedByVoucherId?: string;

  @Column({ name: 'reversal_reason', type: 'text', nullable: true })
  reversalReason?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'varchar', nullable: true })
  postedBy?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;

  @OneToMany(() => BankPaymentLineEntity, (line) => line.bankPayment, {
    cascade: true,
  })
  lines: BankPaymentLineEntity[];

  @ManyToOne(() => BankPaymentEntity, { nullable: true })
  @JoinColumn({ name: 'reverses_voucher_id' })
  reversesVoucher?: BankPaymentEntity;
}
