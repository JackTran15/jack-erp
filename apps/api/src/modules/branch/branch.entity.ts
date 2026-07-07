import {
  Entity,
  Column,
  Unique,
  Index,
  ManyToOne,
  JoinColumn,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { BranchStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

/** Physical store, warehouse, or logical division within an organization. Supports tree hierarchy via parentBranchId. */
@Index('UQ_branches_org_code', ['organizationId', 'code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
@Entity('branches')
@Unique(['organizationId', 'name'])
export class BranchEntity extends BaseEntity {
  @Column({ comment: 'Display name of the branch' })
  name: string;

  @Column({
    type: 'varchar',
    nullable: true,
    comment: 'Store code unique per organization — printed on barcode labels',
  })
  code?: string | null;

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

  /** Trim + coerce blank code to null so the partial unique index treats
   * "no code" as absent (avoids '' collisions across every write path). */
  @BeforeInsert()
  @BeforeUpdate()
  normalizeCode(): void {
    if (typeof this.code === 'string') {
      const trimmed = this.code.trim();
      this.code = trimmed === '' ? null : trimmed;
    }
  }
}
