import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('user_roles')
@Unique(['userId', 'roleId', 'organizationId'])
export class UserRoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;
}
