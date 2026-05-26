import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum SupplierDebtPaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}

/** Records a single payment instalment made against an outstanding supplier debt. */
@Entity('supplier_debt_payments')
@Index(['debtId'])
export class SupplierDebtPaymentEntity extends BaseEntity {
  @Column({ name: 'debt_id', type: 'uuid', comment: 'The supplier debt this payment is applied to' })
  debtId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Amount paid in this instalment' })
  amount: number;

  @Column({ name: 'payment_method', type: 'enum', enum: SupplierDebtPaymentMethod, enumName: 'supplier_debt_payment_method_enum', comment: 'How the payment was made' })
  paymentMethod: SupplierDebtPaymentMethod;

  @Column({ name: 'staff_id', type: 'uuid', comment: 'Staff member who recorded this payment' })
  staffId: string;

  @Column({ name: 'paid_at', type: 'timestamptz', comment: 'Exact timestamp the payment was made' })
  paidAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note about this payment instalment' })
  note?: string;

  @Column({ name: 'cash_payment_id', type: 'uuid', nullable: true, comment: 'The Phiếu chi (cash payment) that paid this instalment' })
  cashPaymentId?: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true, comment: 'Journal entry created when paid in cash' })
  journalEntryId?: string;
}
