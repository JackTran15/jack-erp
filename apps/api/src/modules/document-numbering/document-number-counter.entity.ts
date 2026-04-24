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

@Entity('document_number_counters')
@Unique('UQ_rule_reset_key', ['ruleId', 'resetKey'])
export class DocumentNumberCounterEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'rule_id', type: 'uuid' })
  ruleId: string;

  @ManyToOne(() => DocumentNumberRuleEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'rule_id' })
  rule: DocumentNumberRuleEntity;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @Column({ name: 'current_value', type: 'bigint', default: 0 })
  currentValue: number;

  @Column({ name: 'reset_key', length: 20 })
  resetKey: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
