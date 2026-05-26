import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum SupplierDebtStatus {
  OPEN = 'open',
  PAID = 'paid',
  OVERDUE = 'overdue',
}

export enum SupplierDebtDocumentType {
  GOODS_RECEIPT = 'goods_receipt',
  ADJUSTMENT = 'adjustment',
}

/**
 * Tracks an outstanding amount owed to a supplier, created from a credit
 * (CREDIT payment method) goods receipt. Mirror of the customer-side
 * `invoice_debts` ledger, keyed 1-1 to a goods receipt.
 */
@Entity('supplier_debts')
@Index(['organizationId', 'supplierId', 'status'])
@Index('uq_supplier_debt_goods_receipt', ['goodsReceiptId'], { unique: true })
export class SupplierDebtEntity extends BaseEntity {
  @Column({ name: 'reference_code', comment: 'Human-readable reference code (goods receipt document number)' })
  referenceCode: string;

  @Column({ name: 'goods_receipt_id', type: 'uuid', unique: true, comment: 'The goods receipt that generated this debt (1-to-1)' })
  goodsReceiptId: string;

  @Column({ name: 'supplier_id', type: 'uuid', comment: 'Supplier (inventory_providers) the amount is owed to' })
  supplierId: string;

  @Column({ name: 'document_type', type: 'enum', enum: SupplierDebtDocumentType, enumName: 'supplier_debt_document_type_enum', default: SupplierDebtDocumentType.GOODS_RECEIPT, comment: 'Category of the source document that created or adjusted this debt' })
  documentType: SupplierDebtDocumentType;

  @Column({ name: 'original_amount', type: 'numeric', precision: 18, scale: 2, comment: 'Full goods-receipt amount placed on credit' })
  originalAmount: number;

  @Column({ name: 'paid_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Cumulative amount paid against this debt so far' })
  paidAmount: number;

  @Column({ name: 'remaining_amount', type: 'numeric', precision: 18, scale: 2, comment: 'Balance still owed (originalAmount − paidAmount)' })
  remainingAmount: number;

  @Column({ name: 'issued_at', type: 'date', comment: 'Calendar date the debt was created' })
  issuedAt: string;

  @Column({ name: 'due_date', type: 'date', nullable: true, comment: 'Optional payment deadline' })
  dueDate?: string;

  @Column({ name: 'settled_at', type: 'timestamptz', nullable: true, comment: 'Timestamp when the debt was fully settled; null while open' })
  settledAt?: Date;

  @Column({ type: 'enum', enum: SupplierDebtStatus, enumName: 'supplier_debt_status_enum', default: SupplierDebtStatus.OPEN, comment: 'Current settlement status of the debt' })
  status: SupplierDebtStatus;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note attached to the debt record' })
  note?: string;
}
