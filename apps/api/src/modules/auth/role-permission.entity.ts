import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('role_permissions')
@Unique(['roleId', 'permissionId'])
export class RolePermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'role_id', type: 'uuid' })
  roleId: string;

  @Column({ name: 'permission_id', type: 'uuid' })
  permissionId: string;
}
