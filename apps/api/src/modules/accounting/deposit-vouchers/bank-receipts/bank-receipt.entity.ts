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
  BankReceiptPurpose,
  BankReceiptReferenceType,
  BankVoucherPartnerType,
  BankVoucherStatus,
} from '../enums';
import { BankReceiptLineEntity } from './bank-receipt-line.entity';

/**
 * Deposit-fund receipt voucher (Phiếu thu tiền gửi, NTTK). Columns are declared
 * explicitly (not extending BaseEntity) because branch_id is NOT NULL. Matches
 * the bank_receipts table in 1786600000000-DepositVouchersSchema exactly.
 */
@Entity('bank_receipts')
@Index('idx_bank_receipts_scope', [
  'organizationId',
  'branchId',
  'depositAccountId',
  'docDate',
  'id',
])
@Index('IDX_bank_receipts_movement', ['depositMovementId'])
export class BankReceiptEntity {
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
    enum: BankReceiptPurpose,
    enumName: 'bank_receipt_purpose_enum',
    default: BankReceiptPurpose.OTHER,
  })
  purpose: BankReceiptPurpose;

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

  @Column({ name: 'payer_name', type: 'varchar', length: 255, nullable: true })
  payerName?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason?: string;

  @Column({ name: 'collected_by', type: 'varchar', nullable: true })
  collectedBy?: string;

  /**
   * Resolved from {@link collectedBy} on read — not a column. Lets the client show
   * "Nhân viên thu" without calling the permission-gated user endpoint.
   */
  collectedByCode?: string | null;
  collectedByName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference?: string;

  @Column({ name: 'affect_revenue', type: 'boolean', default: false })
  affectRevenue: boolean;

  @Column({ name: 'contra_account_id', type: 'uuid', nullable: true })
  contraAccountId?: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => `'[]'::jsonb` })
  attachmentIds: string[];

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: BankReceiptReferenceType,
    enumName: 'bank_receipt_reference_type_enum',
    nullable: true,
  })
  referenceType?: BankReceiptReferenceType;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

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

  @OneToMany(() => BankReceiptLineEntity, (line) => line.bankReceipt, {
    cascade: true,
  })
  lines: BankReceiptLineEntity[];

  @ManyToOne(() => BankReceiptEntity, { nullable: true })
  @JoinColumn({ name: 'reverses_voucher_id' })
  reversesVoucher?: BankReceiptEntity;
}
