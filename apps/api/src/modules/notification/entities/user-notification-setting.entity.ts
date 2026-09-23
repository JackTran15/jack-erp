import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** Notification preference — one row per user (scope + enabled type codes). */
@Entity('user_notification_settings')
export class UserNotificationSettingEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'user_id', type: 'uuid', unique: true })
  userId: string;

  /** null = whole chain. */
  @Column({ name: 'scope_branch_id', type: 'uuid', nullable: true })
  scopeBranchId: string | null;

  @Column({ name: 'enabled_types', type: 'text', array: true, default: () => "'{}'" })
  enabledTypes: string[];

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
