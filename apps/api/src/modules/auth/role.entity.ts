import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';

/** Named authorization role scoped to an organization (e.g. Admin, Cashier). */
@Entity('roles')
@Unique(['organizationId', 'name'])
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Tenant that owns this role' })
  organizationId: string;

  @Column({ type: 'varchar', length: 100, comment: 'Human-readable role name, unique per org' })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Optional longer explanation of the roles purpose' })
  description: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false, comment: 'If true, role was auto-created during org setup and cannot be deleted' })
  isSystem: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
