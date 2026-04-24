import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum ExpenseStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  POSTED = 'POSTED',
}

/** Operational expense record. Workflow: DRAFT → APPROVED → POSTED. Posting auto-creates a journal entry. */
@Entity('expenses')
@Index('idx_expense_org_status', ['organizationId', 'status'])
@Index('idx_expense_org_branch', ['organizationId', 'branchId'])
@Index('idx_expense_account', ['accountId'])
export class ExpenseEntity extends BaseEntity {
  @Column({ type: 'text', comment: 'What the expense is for (e.g. Office rent for April 2026)' })
  description: string;

  @Column({
    type: 'numeric',
    precision: 18,
    scale: 2,
    comment: 'Expense amount',
  })
  amount: number;

  @Column({ name: 'account_id', type: 'uuid', comment: 'The expense account to debit in the COA' })
  accountId: string;

  @Column({ name: 'payable_id', type: 'uuid', nullable: true, comment: 'FK to payables — if this expense created a vendor obligation' })
  payableId?: string;

  @Column({
    type: 'enum',
    enum: ExpenseStatus,
    default: ExpenseStatus.DRAFT,
    comment: 'Workflow status (DRAFT, APPROVED, POSTED)',
  })
  status: ExpenseStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true, comment: 'User who approved the expense' })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true, comment: 'When approved' })
  approvedAt?: Date;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true, comment: 'When posted and journal entry created' })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true, comment: 'User who posted' })
  postedBy?: string;
}
