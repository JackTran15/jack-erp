import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { NotificationTarget } from '../core/notification.types';

/** In-app inbox row — one per recipient. */
@Entity('notifications')
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** Wire code — never renamed once shipped. */
  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ name: 'branch_id', type: 'uuid', nullable: true })
  branchId: string | null;

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, string | number | null>;

  @Column({ type: 'jsonb', nullable: true })
  target: NotificationTarget | null;

  @Column({ name: 'source_event_id', type: 'uuid' })
  sourceEventId: string;

  @Column({ name: 'actor_id', type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
