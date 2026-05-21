import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * A queued domain event awaiting publication to Kafka. Generic — not tied to any
 * specific domain. `payload` holds the full `DomainEvent<T>` envelope that the
 * relay republishes verbatim.
 */
@Entity('outbox_messages')
@Index('idx_outbox_pending', ['nextAttemptAt'], { where: '"published_at" IS NULL' })
export class OutboxMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId?: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId?: string;

  @Column({ type: 'varchar', length: 255 })
  topic: string;

  /** Deterministic per (sourceType, sourceId); equals DomainEvent.eventId. */
  @Column({ name: 'event_id', type: 'uuid' })
  eventId: string;

  @Column({ name: 'partition_key', type: 'varchar', length: 255, nullable: true })
  partitionKey?: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt?: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' })
  nextAttemptAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
