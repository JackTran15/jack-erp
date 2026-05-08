import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum DebtStatus {
  OPEN = 'open',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export enum DebtDocumentType {
  CREDIT_INVOICE = 'credit_invoice',
  PAYMENT_RECEIPT = 'payment_receipt',
  ADJUSTMENT = 'adjustment',
}

/** Tracks an outstanding debt created from a credit (debt-payment-method) invoice. */
@Entity('invoice_debts')
@Index(['organizationId', 'customerId', 'status'])
@Index('uq_invoice_debt_invoice', ['invoiceId'], { unique: true })
export class InvoiceDebtEntity extends BaseEntity {
  @Column({ name: 'reference_code', comment: 'Human-readable reference code for the debt record' })
  referenceCode: string;

  @Column({ name: 'invoice_id', type: 'uuid', unique: true, comment: 'The invoice that generated this debt (1-to-1)' })
  invoiceId: string;

  @Column({ name: 'customer_id', type: 'uuid', comment: 'Customer who owes the debt' })
  customerId: string;

  @Column({ name: 'document_type', type: 'enum', enum: DebtDocumentType, comment: 'Category of the source document that created or adjusted this debt' })
  documentType: DebtDocumentType;

  @Column({ name: 'original_amount', type: 'numeric', precision: 18, scale: 2, comment: 'Full invoice amount that was placed on credit' })
  originalAmount: number;

  @Column({ name: 'paid_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Cumulative amount received against this debt so far' })
  paidAmount: number;

  @Column({ name: 'remaining_amount', type: 'numeric', precision: 18, scale: 2, comment: 'Balance still owed (originalAmount − paidAmount)' })
  remainingAmount: number;

  @Column({ name: 'issued_at', type: 'date', comment: 'Calendar date the debt was created' })
  issuedAt: string;

  @Column({ name: 'due_date', type: 'date', nullable: true, comment: 'Optional payment deadline' })
  dueDate?: string;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true, comment: 'Timestamp when the debt was fully settled; null while open' })
  settledAt?: Date;

  @Column({ type: 'enum', enum: DebtStatus, default: DebtStatus.OPEN, comment: 'Current collection status of the debt' })
  status: DebtStatus;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note attached to the debt record' })
  note?: string;
}
