import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { JournalEntryEntity } from './journal-entry.entity';

/** Single debit or credit line within a journal entry. Sum of debits must equal sum of credits. */
@Entity('journal_lines')
@Index('idx_journal_line_entry', ['journalEntryId'])
@Index('idx_journal_line_account', ['accountId'])
export class JournalLineEntity extends BaseEntity {
  @Column({ name: 'journal_entry_id', type: 'uuid', comment: 'Parent journal entry' })
  journalEntryId: string;

  @ManyToOne(() => JournalEntryEntity, (entry) => entry.lines)
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry: JournalEntryEntity;

  @Column({ name: 'account_id', type: 'uuid', comment: 'The ledger account affected' })
  accountId: string;

  @Column({
    name: 'debit_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Amount debited to this account (0 if this is a credit line)',
  })
  debitAmount: number;

  @Column({
    name: 'credit_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Amount credited to this account (0 if this is a debit line)',
  })
  creditAmount: number;

  @Column({ type: 'text', nullable: true, comment: 'Per-line description (e.g. Revenue from sale SAL-001)' })
  description?: string;

  @Column({ name: 'line_order', type: 'int', comment: 'Display order of lines within the entry (1-based)' })
  lineOrder: number;
}
