import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Unique,
} from 'typeorm';

/** Links a user (salesperson) to a branch where they are authorized to conduct sales. */
@Entity('salesman_assignments')
@Unique(['userId', 'branchId'])
export class SalesmanAssignmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', comment: 'The user assigned as a salesperson' })
  userId: string;

  @Column({ name: 'branch_id', type: 'uuid', comment: 'The branch where the user operates' })
  branchId: string;

  @Column({ name: 'organization_id', type: 'uuid', comment: 'Organization scope for tenant isolation' })
  organizationId: string;

  @CreateDateColumn({ name: 'assigned_at', comment: 'Timestamp of assignment creation' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'uuid', comment: 'Admin or manager who created this assignment' })
  assignedBy: string;
}
