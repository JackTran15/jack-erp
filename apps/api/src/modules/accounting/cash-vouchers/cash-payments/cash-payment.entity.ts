import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import {
  CashPaymentPurpose,
  CashPaymentReferenceType,
  CashVoucherPartnerType,
  CashVoucherStatus,
} from '../enums';
import { CashPaymentLineEntity } from './cash-payment-line.entity';

@Entity('cash_payments')
@Index('IDX_cash_payments_org_status', ['organizationId', 'status'])
@Index('IDX_cash_payments_org_voucher_date', ['organizationId', 'voucherDate'])
@Index('IDX_cash_payments_account_voucher_date', ['cashAccountId', 'voucherDate'])
export class CashPaymentEntity extends BaseEntity {
  @Column({ name: 'document_number', type: 'varchar', length: 64, nullable: true })
  documentNumber?: string;

  @Column({ name: 'voucher_date', type: 'date' })
  voucherDate: string;

  @Column({
    type: 'enum',
    enum: CashVoucherStatus,
    enumName: 'cash_payment_status_enum',
    default: CashVoucherStatus.DRAFT,
  })
  status: CashVoucherStatus;

  @Column({
    type: 'enum',
    enum: CashPaymentPurpose,
    enumName: 'cash_payment_purpose_enum',
    default: CashPaymentPurpose.OTHER,
  })
  purpose: CashPaymentPurpose;

  @Column({
    name: 'partner_type',
    type: 'enum',
    enum: CashVoucherPartnerType,
    enumName: 'cash_voucher_partner_type_enum',
    nullable: true,
  })
  partnerType?: CashVoucherPartnerType;

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

  @Column({ name: 'staff_id', type: 'uuid', nullable: true })
  staffId?: string;

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: CashPaymentReferenceType,
    enumName: 'cash_payment_reference_type_enum',
    nullable: true,
  })
  referenceType?: CashPaymentReferenceType;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

  @Column({ name: 'cash_account_id', type: 'uuid' })
  cashAccountId: string;

  @Column({ name: 'contra_account_id', type: 'uuid' })
  contraAccountId: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => `'[]'::jsonb` })
  attachmentIds: string[];

  @Column({ name: 'cash_movement_id', type: 'uuid', nullable: true })
  cashMovementId?: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId?: string;

  @Column({ name: 'reversed_by_voucher_id', type: 'uuid', nullable: true })
  reversedByVoucherId?: string;

  @Column({ name: 'reverses_voucher_id', type: 'uuid', nullable: true })
  reversesVoucherId?: string;

  @Column({ name: 'reversal_reason', type: 'varchar', length: 500, nullable: true })
  reversalReason?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @OneToMany(() => CashPaymentLineEntity, (line) => line.cashPayment, {
    cascade: true,
  })
  lines: CashPaymentLineEntity[];

  @ManyToOne(() => CashPaymentEntity, { nullable: true })
  @JoinColumn({ name: 'reverses_voucher_id' })
  reversesVoucher?: CashPaymentEntity;
}
