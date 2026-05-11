import { Entity, Column, Index, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { DeadLetterStatus } from '@erp/shared-interfaces';

/** Records Kafka messages that exhausted DLQ retries. Admin can replay or ignore. */
@Entity('dead_letter_events')
@Index('idx_dle_status_topic', ['status', 'topic'])
@Index('idx_dle_org_created', ['organizationId', 'createdAt'])
export class DeadLetterEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ length: 255 })
  topic: string;

  @Column({ type: 'integer', nullable: true })
  partition?: number;

  @Column({ type: 'bigint', nullable: true })
  offset?: string;

  @Column({ length: 255, nullable: true })
  key?: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'retry_count', type: 'integer', default: 3 })
  retryCount: number;

  @Column({
    type: 'enum',
    enum: DeadLetterStatus,
    default: DeadLetterStatus.PENDING,
  })
  status: DeadLetterStatus;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy?: string;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt?: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string;
}
