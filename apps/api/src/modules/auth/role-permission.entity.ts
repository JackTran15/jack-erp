import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

/** Join table linking a role to a permission. Determines which API actions a role can perform. */
@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'role_id', type: 'uuid', comment: 'The role receiving the permission' })
  roleId: string;

  @Column({ name: 'permission_id', type: 'uuid', comment: 'The permission being granted' })
  permissionId: string;
}
