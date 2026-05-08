import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum DebtPaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
}

/** Records a single repayment instalment made against an outstanding invoice debt. */
@Entity('debt_payments')
@Index(['debtId'])
export class DebtPaymentEntity extends BaseEntity {
  @Column({ name: 'debt_id', type: 'uuid', comment: 'The invoice debt this payment is applied to' })
  debtId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Amount paid in this instalment' })
  amount: number;

  @Column({ name: 'payment_method', type: 'enum', enum: DebtPaymentMethod, comment: 'How the repayment was received' })
  paymentMethod: DebtPaymentMethod;

  @Column({ name: 'staff_id', type: 'uuid', comment: 'Staff member who collected or recorded this payment' })
  staffId: string;

  @Column({ name: 'paid_at', type: 'timestamptz', comment: 'Exact timestamp the repayment was received' })
  paidAt: Date;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note about this payment instalment' })
  note?: string;
}
