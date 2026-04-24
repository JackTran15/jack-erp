import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { JournalEntryEntity } from './journal-entry.entity';

@Entity('journal_lines')
@Index('idx_journal_line_entry', ['journalEntryId'])
@Index('idx_journal_line_account', ['accountId'])
export class JournalLineEntity extends BaseEntity {
  @Column({ name: 'journal_entry_id', type: 'uuid' })
  journalEntryId: string;

  @ManyToOne(() => JournalEntryEntity, (entry) => entry.lines)
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry: JournalEntryEntity;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({
    name: 'debit_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  debitAmount: number;

  @Column({
    name: 'credit_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  creditAmount: number;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'line_order', type: 'int' })
  lineOrder: number;
}
