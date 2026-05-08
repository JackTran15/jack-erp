import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { InvoicePaymentMethod } from './invoice.entity';

/** One payment line tendered against a POS invoice. Multiple records per invoice support split tender. */
@Entity('invoice_payments')
@Index(['invoiceId'])
export class InvoicePaymentEntity extends BaseEntity {
  @Column({ name: 'invoice_id', type: 'uuid', comment: 'Invoice this payment line belongs to' })
  invoiceId: string;

  @Column({ name: 'payment_method', type: 'enum', enum: InvoicePaymentMethod, comment: 'Payment method used for this line' })
  paymentMethod: InvoicePaymentMethod;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Amount tendered via this method' })
  amount: number;

  @Column({ name: 'account_id', type: 'uuid', comment: 'GL account to debit for this payment line' })
  accountId: string;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: 'External reference: card auth code, bank transfer ref, etc.' })
  reference?: string;
}
