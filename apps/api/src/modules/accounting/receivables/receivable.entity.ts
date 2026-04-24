import { Entity, Column, Index, OneToMany } from 'typeorm';
import { ReceivableStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReceivableSettlementEntity } from './receivable-settlement.entity';

/** Amount owed by a customer to the organization. Supports partial settlement and write-offs. */
@Entity('receivables')
@Index('uq_receivable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index('idx_receivable_org_status', ['organizationId', 'status'])
@Index('idx_receivable_org_branch', ['organizationId', 'branchId'])
@Index('idx_receivable_due_date', ['dueDate'])
@Index('idx_receivable_customer', ['customerId'])
export class ReceivableEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, nullable: true, comment: 'Reference number' })
  documentNumber?: string;

  @Column({ name: 'customer_id', type: 'uuid', comment: 'The customer who owes the amount' })
  customerId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Total amount owed by the customer',
  })
  amount: number;

  @Column({ length: 10, default: 'USD', comment: 'ISO 4217 currency code' })
  currency: string;

  @Column({ name: 'due_date', type: 'date', comment: 'Payment deadline' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: ReceivableStatus,
    default: ReceivableStatus.DRAFT,
    comment: 'Current lifecycle status',
  })
  status: ReceivableStatus;

  @Column({ name: 'account_id', type: 'uuid', comment: 'Revenue or asset account to credit' })
  accountId: string;

  @Column({
    name: 'settled_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Running total of all payments received from the customer',
  })
  settledAmount: number;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true, comment: 'When posted to the books' })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true, comment: 'User who posted' })
  postedBy?: string;

  @Column({ name: 'write_off_reason', type: 'text', nullable: true, comment: 'Explanation when the receivable is written off as uncollectible' })
  writeOffReason?: string;

  @OneToMany(() => ReceivableSettlementEntity, (s) => s.receivable, {
    cascade: true,
  })
  settlements: ReceivableSettlementEntity[];
}
