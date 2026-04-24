import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { InventoryImportJobEntity } from './inventory-import-job.entity';

export enum ImportRowStatus {
  VALID = 'VALID',
  ERROR = 'ERROR',
  COMMITTED = 'COMMITTED',
}

@Entity('inventory_import_job_rows')
@Index(['jobId', 'status'])
export class InventoryImportJobRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  jobId: string;

  @Column({ name: 'row_number', type: 'int' })
  rowNumber: number;

  @Column({ name: 'raw_data', type: 'jsonb' })
  rawData: Record<string, unknown>;

  @Column({ type: 'enum', enum: ImportRowStatus })
  status: ImportRowStatus;

  @Column({ name: 'error_messages', type: 'jsonb', nullable: true })
  errorMessages?: Array<{ column?: string; code: string; message: string }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => InventoryImportJobEntity, (job) => job.rows)
  @JoinColumn({ name: 'job_id' })
  job?: InventoryImportJobEntity;
}
