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

/** Individual row from a CSV import job. Stores raw data, validation status, and errors. */
@Entity('inventory_import_job_rows')
@Index(['jobId', 'status'])
export class InventoryImportJobRowEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'uuid', comment: 'Parent import job' })
  jobId: string;

  @Column({ name: 'row_number', type: 'int', comment: '1-based row index from the CSV file' })
  rowNumber: number;

  @Column({ name: 'raw_data', type: 'jsonb', comment: 'Parsed CSV row as a key-value object' })
  rawData: Record<string, unknown>;

  @Column({ type: 'enum', enum: ImportRowStatus, comment: 'Row processing status (VALID, ERROR, COMMITTED)' })
  status: ImportRowStatus;

  @Column({ name: 'error_messages', type: 'jsonb', nullable: true, comment: 'Array of { column?, code, message } objects describing validation failures' })
  errorMessages?: Array<{ column?: string; code: string; message: string }>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => InventoryImportJobEntity, (job) => job.rows)
  @JoinColumn({ name: 'job_id' })
  job?: InventoryImportJobEntity;
}
