import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

/** Physical store, warehouse, or logical division within an organization. Supports tree hierarchy via parentBranchId. */
@Entity('branches')
@Unique(['organizationId', 'name'])
export class BranchEntity extends BaseEntity {
  @Column({ comment: 'Display name of the branch' })
  name: string;

  @Column({ nullable: true, comment: 'Physical address of the branch' })
  address?: string;

  @Column({ nullable: true, comment: 'Branch phone number' })
  phone?: string;

  @Column({ nullable: true, comment: 'Branch contact email' })
  email?: string;

  @Column({
    type: 'enum',
    enum: BranchStatus,
    default: BranchStatus.ACTIVE,
    comment: 'Branch lifecycle status (ACTIVE, SUSPENDED, ARCHIVED)',
  })
  status: BranchStatus;

  @Column({ name: 'is_main_branch', default: false, comment: 'If true, this is the organizations primary/headquarters branch' })
  isMainBranch: boolean;

  @Column({ name: 'parent_branch_id', type: 'uuid', nullable: true, comment: 'FK to branches — enables hierarchical branch structures' })
  parentBranchId?: string;

  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'parent_branch_id' })
  parentBranch?: BranchEntity;
}
