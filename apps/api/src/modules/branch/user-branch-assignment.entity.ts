import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/** Associates a user with a branch they are authorized to operate in. */
@Entity('user_branch_assignments')
@Unique(['userId', 'branchId'])
export class UserBranchAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', comment: 'The user being assigned to a branch' })
  userId: string;

  @Column({ name: 'branch_id', type: 'uuid', comment: 'The target branch' })
  branchId: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Organization scope for tenant isolation' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at', comment: 'When the assignment was created' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'uuid', comment: 'Admin user who made the assignment' })
  assignedBy: string;
}
