import { Entity, Column, Index } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

export enum ResetPolicy {
  NEVER = 'NEVER',
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

/** Defines how document numbers are formatted for a specific document type. Pattern: {prefix}{date?}{sequence}{suffix?}. */
@Entity('document_number_rules')
// Partial, so NULL is excluded from the key. A plain unique index over
// (organization_id, branch_id, document_type, is_active) does not constrain the
// org-wide rules at all — they all carry branch_id NULL, and Postgres treats
// NULLs as distinct. A branch rule overriding the org default stays legal.
@Index('UQ_doc_rule_org_default', ['organizationId', 'documentType'], {
  unique: true,
  where: '"is_active" AND "branch_id" IS NULL',
})
@Index(
  'UQ_doc_rule_org_branch',
  ['organizationId', 'branchId', 'documentType'],
  { unique: true, where: '"is_active" AND "branch_id" IS NOT NULL' },
)
export class DocumentNumberRuleEntity extends BaseEntity {
  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DocumentType,
    comment: 'The type of document this rule applies to (SALE, INVOICE, etc.)',
  })
  documentType: DocumentType;

  @Column({ length: 50, comment: 'Fixed string prepended to the number (e.g. INV-, SAL-)' })
  prefix: string;

  @Column({ length: 50, nullable: true, comment: 'Optional fixed string appended after the sequence' })
  suffix?: string;

  @Column({ name: 'include_date', default: true, comment: 'Whether to embed a date segment in the number' })
  includeDate: boolean;

  @Column({ name: 'date_format', length: 20, default: 'YYYYMMDD', comment: 'Date format string used when includeDate is true' })
  dateFormat: string;

  @Column({ name: 'sequence_length', type: 'smallint', default: 5, comment: 'Number of digits for the sequence portion, zero-padded' })
  sequenceLength: number;

  @Column({
    name: 'reset_policy',
    type: 'enum',
    enum: ResetPolicy,
    default: ResetPolicy.NEVER,
    comment: 'When to reset the counter back to 1 (NEVER, DAILY, MONTHLY, YEARLY)',
  })
  resetPolicy: ResetPolicy;

  @Column({ name: 'is_active', default: true, comment: 'Whether this rule is currently in use' })
  isActive: boolean;
}
