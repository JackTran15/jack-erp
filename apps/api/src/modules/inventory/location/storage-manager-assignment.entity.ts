import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

@Entity('storage_manager_assignments')
@Unique(['userId', 'storageId'])
export class StorageManagerAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'storage_id', type: 'uuid' })
  storageId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'uuid' })
  assignedBy: string;
}
