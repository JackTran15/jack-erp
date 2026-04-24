import { Entity, Column, Index, OneToMany } from 'typeorm';
import { PayableStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PayableSettlementEntity } from './payable-settlement.entity';

/** Amount owed to a vendor/supplier. Lifecycle: DRAFT → POSTED → PARTIALLY_SETTLED → SETTLED. */
@Entity('payables')
@Index('uq_payable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index('idx_payable_org_status', ['organizationId', 'status'])
@Index('idx_payable_org_branch', ['organizationId', 'branchId'])
@Index('idx_payable_due_date', ['dueDate'])
export class PayableEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, nullable: true, comment: 'Auto-generated or manually assigned reference number' })
  documentNumber?: string;

  @Column({ name: 'vendor_name', length: 255, comment: 'Name of the vendor/supplier (free text; no vendor master yet)' })
  vendorName: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Total amount owed to the vendor',
  })
  amount: number;

  @Column({ length: 10, default: 'USD', comment: 'ISO 4217 currency code' })
  currency: string;

  @Column({ name: 'due_date', type: 'date', comment: 'Payment deadline' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: PayableStatus,
    default: PayableStatus.DRAFT,
    comment: 'Current lifecycle status (DRAFT, POSTED, PARTIALLY_SETTLED, SETTLED, VOIDED)',
  })
  status: PayableStatus;

  @Column({ name: 'account_id', type: 'uuid', comment: 'Expense or liability account to debit' })
  accountId: string;

  @Column({
    name: 'settled_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Running total of all payments made against this payable',
  })
  settledAmount: number;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true, comment: 'When the payable was posted to the books' })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true, comment: 'User who posted' })
  postedBy?: string;

  @OneToMany(() => PayableSettlementEntity, (s) => s.payable, {
    cascade: true,
  })
  settlements: PayableSettlementEntity[];
}
