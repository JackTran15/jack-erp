import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/** Join table linking a user to a role within an organization. */
@Entity('user_roles')
@Unique(['userId', 'roleId', 'organizationId'])
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', comment: 'The user receiving the role' })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid', comment: 'The role being assigned' })
  roleId: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Organization context for this assignment' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at', comment: 'When the role was assigned' })
  assignedAt: Date;
}
