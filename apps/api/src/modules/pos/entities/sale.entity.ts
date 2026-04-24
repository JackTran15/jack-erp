import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleLineEntity } from './sale-line.entity';
import { PaymentEntity } from './payment.entity';

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  RETURNED = 'RETURNED',
  PARTIALLY_RETURNED = 'PARTIALLY_RETURNED',
}

/** Completed POS sale transaction with line items and payments. Can be fully or partially returned. */
@Entity('pos_sales')
@Index('uq_sale_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index(['organizationId', 'sessionId'])
@Index(['organizationId', 'branchId', 'saleDate'])
@Index(['organizationId', 'customerId'])
export class SaleEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, comment: 'Auto-generated receipt number (e.g. SAL-20260425-00001)' })
  documentNumber: string;

  @Column({ name: 'session_id', type: 'uuid', comment: 'The POS session this sale belongs to' })
  sessionId: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true, comment: 'Optional customer linkage for loyalty/receivables' })
  customerId?: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Sum of all line totals before tax',
  })
  subtotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Total tax amount across all lines',
  })
  taxAmount: number;

  @Column({
    name: 'total_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Final amount after tax (subtotal + taxAmount)',
  })
  totalAmount: number;

  @Column({
    type: 'enum',
    enum: SaleStatus,
    default: SaleStatus.COMPLETED,
    comment: 'Current sale status (COMPLETED, RETURNED, PARTIALLY_RETURNED)',
  })
  status: SaleStatus;

  @Column({ name: 'sale_date', type: 'timestamptz', comment: 'Timestamp of the sale' })
  saleDate: Date;

  @OneToMany(() => SaleLineEntity, (line) => line.sale, { cascade: true })
  lines: SaleLineEntity[];

  @OneToMany(() => PaymentEntity, (payment) => payment.sale, { cascade: true })
  payments: PaymentEntity[];
}
