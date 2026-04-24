import { Entity, Column, Unique, Index, OneToMany } from 'typeorm';
import { ImportJobStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { InventoryImportJobRowEntity } from './inventory-import-job-row.entity';

export enum ImportJobType {
  ITEMS = 'ITEMS',
  OPENING_BALANCES = 'OPENING_BALANCES',
  ADJUSTMENTS = 'ADJUSTMENTS',
}

@Entity('inventory_import_jobs')
@Unique(['organizationId', 'type', 'idempotencyKey'])
@Index(['organizationId', 'status'])
export class InventoryImportJobEntity extends BaseEntity {
  @Column({ type: 'enum', enum: ImportJobType })
  type: ImportJobType;

  @Column({ name: 'file_name' })
  fileName: string;

  @Column({ name: 'file_checksum' })
  fileChecksum: string;

  @Column({ name: 'idempotency_key' })
  idempotencyKey: string;

  @Column({ type: 'enum', enum: ImportJobStatus, default: ImportJobStatus.VALIDATING })
  status: ImportJobStatus;

  @Column({ name: 'total_rows', type: 'int', default: 0 })
  totalRows: number;

  @Column({ name: 'valid_rows', type: 'int', default: 0 })
  validRows: number;

  @Column({ name: 'error_rows', type: 'int', default: 0 })
  errorRows: number;

  @OneToMany(() => InventoryImportJobRowEntity, (row) => row.job)
  rows?: InventoryImportJobRowEntity[];
}
