import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum NotificationDeliveryStatus {
  PENDING = 'pending',
  RETRYING = 'retrying',
  SENT = 'sent',
  /** Gave up after the max number of attempts. */
  FAILED = 'failed',
  /** Too old to be useful by the time it could be sent. */
  EXPIRED = 'expired',
  /** Permanent error (dead token, bad payload) — retrying cannot help. */
  DROPPED = 'dropped',
}

/** Queue row + delivery log for one (notification × channel × device). */
@Entity('notification_deliveries')
export class NotificationDeliveryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'notification_id', type: 'uuid' })
  notificationId: string;

  @Column({ type: 'varchar', length: 32 })
  channel: string;

  @Column({ name: 'device_id', type: 'uuid', nullable: true })
  deviceId: string | null;

  @Column({
    type: 'enum',
    enum: NotificationDeliveryStatus,
    enumName: 'notification_deliveries_status_enum',
    default: NotificationDeliveryStatus.PENDING,
  })
  status: NotificationDeliveryStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt: Date;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'provider_message_id', type: 'varchar', length: 255, nullable: true })
  providerMessageId: string | null;

  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
