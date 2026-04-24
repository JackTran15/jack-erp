import { Entity, Column, Index, OneToMany } from 'typeorm';
import { PayableStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { PayableSettlementEntity } from './payable-settlement.entity';

@Entity('payables')
@Index('uq_payable_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index('idx_payable_org_status', ['organizationId', 'status'])
@Index('idx_payable_org_branch', ['organizationId', 'branchId'])
@Index('idx_payable_due_date', ['dueDate'])
export class PayableEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, nullable: true })
  documentNumber?: string;

  @Column({ name: 'vendor_name', length: 255 })
  vendorName: string;

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
    enum: PayableStatus,
    default: PayableStatus.DRAFT,
  })
  status: PayableStatus;

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

  @OneToMany(() => PayableSettlementEntity, (s) => s.payable, {
    cascade: true,
  })
  settlements: PayableSettlementEntity[];
}
