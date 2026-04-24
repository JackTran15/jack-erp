import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/** Assigns a user as a manager of a specific storage within a branch. */
@Entity('storage_manager_assignments')
@Unique(['userId', 'storageId'])
export class StorageManagerAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', comment: 'The user being assigned as storage manager' })
  userId: string;

  @Column({ name: 'branch_id', type: 'uuid', comment: 'The branch containing the storage' })
  branchId: string;

  @Column({ name: 'storage_id', type: 'uuid', comment: 'The storage being managed' })
  storageId: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Organization scope' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at', comment: 'When the assignment was created' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'uuid', comment: 'Who made the assignment' })
  assignedBy: string;
}
