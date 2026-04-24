import { Entity, Column, Index, OneToMany } from 'typeorm';
import { ReceivableStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReceivableSettlementEntity } from './receivable-settlement.entity';

@Entity('receivables')
@Index('uq_receivable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index('idx_receivable_org_status', ['organizationId', 'status'])
@Index('idx_receivable_org_branch', ['organizationId', 'branchId'])
@Index('idx_receivable_due_date', ['dueDate'])
@Index('idx_receivable_customer', ['customerId'])
export class ReceivableEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, nullable: true })
  documentNumber?: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  amount: number;

  @Column({ length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'due_date', type: 'date' })
  dueDate: string;

  @Column({
    type: 'enum',
    enum: ReceivableStatus,
    default: ReceivableStatus.DRAFT,
  })
  status: ReceivableStatus;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({
    name: 'settled_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  settledAmount: number;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @Column({ name: 'write_off_reason', type: 'text', nullable: true })
  writeOffReason?: string;

  @OneToMany(() => ReceivableSettlementEntity, (s) => s.receivable, {
    cascade: true,
  })
  settlements: ReceivableSettlementEntity[];
}
