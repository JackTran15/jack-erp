import { Entity, Column, Unique } from 'typeorm';
import { DocumentType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

export enum ResetPolicy {
  NEVER = 'NEVER',
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

@Entity('document_number_rules')
@Unique('UQ_active_rule_scope', [
  'organizationId',
  'branchId',
  'documentType',
  'isActive',
])
export class DocumentNumberRuleEntity extends BaseEntity {
  @Column({
    name: 'document_type',
    type: 'enum',
    enum: DocumentType,
  })
  documentType: DocumentType;

  @Column({ length: 50 })
  prefix: string;

  @Column({ length: 50, nullable: true })
  suffix?: string;

  @Column({ name: 'include_date', default: true })
  includeDate: boolean;

  @Column({ name: 'date_format', length: 20, default: 'YYYYMMDD' })
  dateFormat: string;

  @Column({ name: 'sequence_length', type: 'smallint', default: 5 })
  sequenceLength: number;

  @Column({
    name: 'reset_policy',
    type: 'enum',
    enum: ResetPolicy,
    default: ResetPolicy.NEVER,
  })
  resetPolicy: ResetPolicy;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;
}
