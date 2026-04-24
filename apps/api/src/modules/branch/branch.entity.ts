import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

@Entity('branches')
@Unique(['organizationId', 'name'])
export class BranchEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  email?: string;

  @Column({
    type: 'enum',
    enum: BranchStatus,
    default: BranchStatus.ACTIVE,
  })
  status: BranchStatus;

  @Column({ name: 'is_main_branch', default: false })
  isMainBranch: boolean;

  @Column({ name: 'parent_branch_id', type: 'uuid', nullable: true })
  parentBranchId?: string;

  @ManyToOne(() => BranchEntity, { nullable: true })
  @JoinColumn({ name: 'parent_branch_id' })
  parentBranch?: BranchEntity;
}
