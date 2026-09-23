import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One mobile app installation registered for push. See migration
 * `1790060000000-CreateUserDevices` for why the key is the installation, not the token.
 */
@Entity('user_devices')
export class UserDeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'installation_id', type: 'varchar', length: 64 })
  installationId: string;

  @Column({ type: 'varchar', length: 32 })
  app: string;

  @Column({ type: 'varchar', length: 16 })
  platform: string;

  @Column({ name: 'fcm_token', type: 'text' })
  fcmToken: string;

  @Column({ type: 'varchar', length: 8, default: 'vi' })
  locale: string;

  @Column({ name: 'app_version', type: 'varchar', length: 32, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  environment: string | null;

  @Column({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
