import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/** Links a user (sales manager) to a branch where they have managerial authority over sales. */
@Entity('sales_manager_assignments')
@Unique(['userId', 'branchId'])
export class SalesManagerAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', comment: 'The user assigned as sales manager' })
  userId: string;

  @Column({ name: 'branch_id', type: 'uuid', comment: 'The branch under this managers authority' })
  branchId: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Organization scope' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at', comment: 'When the assignment was created' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'uuid', comment: 'Who made the assignment' })
  assignedBy: string;
}
