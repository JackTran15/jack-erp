import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum ExpenseStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
}

@Entity('expenses')
@Index('idx_expense_org_status', ['organizationId', 'status'])
@Index('idx_expense_org_branch', ['organizationId', 'branchId'])
@Index('idx_expense_account', ['accountId'])
export class ExpenseEntity extends BaseEntity {
  @Column({ type: 'text' })
  description: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
  })
  amount: number;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'payable_id', type: 'uuid', nullable: true })
  payableId?: string;

  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.DRAFT,
  })
  status: ExpenseStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;
}
