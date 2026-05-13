import { Entity, Column, Index, ManyToOne, JoinColumn, DeleteDateColumn } from 'typeorm';
import { CustomerCreditStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';
import { CustomerEntity } from './customer.entity';

export { CustomerCreditStatus };

/**
 * Store credit ledger row — issued when a RETURN invoice settles with
 * `refundMethod = STORE_CREDIT`. Customer can redeem against later invoices.
 */
@Entity('customer_credits')
@Index('uq_customer_credit_ref', ['organizationId', 'referenceCode'], { unique: true })
@Index('idx_customer_credit_customer_status', ['customerId', 'status'], {
  where: '"deleted_at" IS NULL',
})
export class CustomerCreditEntity extends BaseEntity {
  @Column({ name: 'customer_id', type: 'uuid', comment: 'Owner of the credit' })
  customerId: string;

  @ManyToOne(() => CustomerEntity)
  @JoinColumn({ name: 'customer_id' })
  customer?: CustomerEntity;

  @Column({ name: 'source_invoice_id', type: 'uuid', comment: 'RETURN invoice that issued this credit' })
  sourceInvoiceId: string;

  @Column({ name: 'reference_code', length: 50, comment: 'Human-friendly credit code, unique per org' })
  referenceCode: string;

  @Column({ name: 'original_amount', type: 'numeric', precision: 18, scale: 2, comment: 'Credit value at issuance' })
  originalAmount: number;

  @Column({ name: 'used_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Cumulative redeemed amount' })
  usedAmount: number;

  @Column({ name: 'remaining_amount', type: 'numeric', precision: 18, scale: 2, comment: 'originalAmount - usedAmount' })
  remainingAmount: number;

  @Column({ type: 'enum', enum: CustomerCreditStatus, default: CustomerCreditStatus.OPEN, comment: 'Lifecycle status' })
  status: CustomerCreditStatus;

  @Column({ name: 'issued_at', type: 'date', comment: 'Date the credit was issued' })
  issuedAt: string;

  @Column({ name: 'expires_at', type: 'date', nullable: true, comment: 'Optional expiry date — v2 background job will mark EXPIRED' })
  expiresAt?: string;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}
