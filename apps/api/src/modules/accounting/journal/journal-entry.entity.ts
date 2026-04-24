import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import { JournalSource, JournalStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { JournalLineEntity } from './journal-line.entity';

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
  @Column({ name: 'document_number', length: 100 })
  documentNumber: string;

  @Column({ type: 'enum', enum: JournalSource })
  source: JournalSource;

  @Column({ name: 'source_reference_id', type: 'uuid', nullable: true })
  sourceReferenceId?: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'enum', enum: JournalStatus, default: JournalStatus.POSTED })
  status: JournalStatus;

  @Column({ name: 'posted_at', type: 'timestamptz' })
  postedAt: Date;

  @Column({ name: 'posted_by', type: 'uuid' })
  postedBy: string;

  @Column({ name: 'reversed_by_journal_id', type: 'uuid', nullable: true })
  reversedByJournalId?: string;

  @Column({ name: 'reversal_of_journal_id', type: 'uuid', nullable: true })
  reversalOfJournalId?: string;

  @OneToMany(() => JournalLineEntity, (line) => line.journalEntry, {
    cascade: true,
  })
  lines: JournalLineEntity[];
}
