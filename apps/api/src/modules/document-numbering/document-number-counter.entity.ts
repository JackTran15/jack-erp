import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { DocumentNumberRuleEntity } from './document-number-rule.entity';

/** Tracks the current sequence value for a numbering rule per reset period. Atomically incremented when generating document numbers. */
@Entity('document_number_counters')
@Unique('UQ_rule_reset_key', ['ruleId', 'resetKey'])
export class DocumentNumberCounterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_id', type: 'uuid', comment: 'The numbering rule this counter belongs to' })
  ruleId: string;

  @ManyToOne(() => DocumentNumberRuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: DocumentNumberRuleEntity;

  @Column({ name: 'organization_id', comment: 'Organization scope' })
  organizationId: string;

  @Column({ name: 'branch_id', nullable: true, comment: 'Branch scope (mirrors the rules branch scope)' })
  branchId?: string;

  @Column({ name: 'current_value', type: 'bigint', default: 0, comment: 'Last used sequence number; next document gets currentValue + 1' })
  currentValue: number;

  @Column({ name: 'reset_key', length: 20, comment: 'Period identifier (e.g. 2026, 202604, or GLOBAL for NEVER)' })
  resetKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
