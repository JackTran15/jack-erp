import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import { JournalSource, JournalStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { JournalLineEntity } from './journal-line.entity';

/** Double-entry journal entry with balanced debit/credit lines. Auto or manually created. Supports reversal. */
@Entity('journal_entries')
@Index('uq_journal_doc_number', ['organizationId', 'documentNumber'], {
  unique: true,
})
@Index('idx_journal_org_source', ['organizationId', 'source'])
@Index('idx_journal_org_status', ['organizationId', 'status'])
@Index('idx_journal_org_branch', ['organizationId', 'branchId'])
@Index('idx_journal_posted_at', ['postedAt'])
@Index('idx_journal_source_ref', ['sourceReferenceId'])
export class JournalEntryEntity extends BaseEntity {
  @Column({ name: 'document_number', length: 100, comment: 'Auto-generated journal number (e.g. JNL-20260425-00001)' })
  documentNumber: string;

  @Column({ type: 'enum', enum: JournalSource, comment: 'System module that created this entry (SALE, RETURN, MANUAL, etc.)' })
  source: JournalSource;

  @Column({ name: 'source_reference_id', type: 'uuid', nullable: true, comment: 'FK to originating document (sale, expense, etc.)' })
  sourceReferenceId?: string;

  @Column({ type: 'text', nullable: true, comment: 'Human-readable description of the transaction' })
  description?: string;

  @Column({ type: 'text', nullable: true, comment: 'Internal notes not shown in reports' })
  notes?: string;

  @Column({ type: 'enum', enum: JournalStatus, default: JournalStatus.POSTED, comment: 'Whether this entry is active or has been reversed' })
  status: JournalStatus;

  @Column({ name: 'posted_at', type: 'timestamptz', comment: 'Financial posting date (may differ from createdAt)' })
  postedAt: Date;

  @Column({ name: 'posted_by', type: 'uuid', comment: 'User who posted the entry' })
  postedBy: string;

  @Column({ name: 'reversed_by_journal_id', type: 'uuid', nullable: true, comment: 'FK to journal_entries — the reversing entry (if reversed)' })
  reversedByJournalId?: string;

  @Column({ name: 'reversal_of_journal_id', type: 'uuid', nullable: true, comment: 'FK to journal_entries — the original entry (if this is a reversal)' })
  reversalOfJournalId?: string;

  @OneToMany(() => JournalLineEntity, (line) => line.journalEntry, {
    cascade: true,
  })
  lines: JournalLineEntity[];
}
