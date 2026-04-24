import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/** Human operator who can authenticate and perform actions in the system. */
@Entity('users')
@Unique(['email', 'organizationId'])
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Tenant the user belongs to; used for row-level security filtering' })
  organizationId: string;

  @Column({ type: 'varchar', length: 255, comment: 'Login email address; unique within the organization' })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, comment: 'Bcrypt hash of the users password; never exposed via API' })
  passwordHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100, comment: 'Users given name, shown in UI and reports' })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100, comment: 'Users family name' })
  lastName: string;

  @Column({ name: 'is_active', type: 'boolean', default: true, comment: 'When false the user cannot log in or perform any action; acts as a soft-delete' })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true, comment: 'Timestamp of the users most recent successful authentication' })
  lastLoginAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
