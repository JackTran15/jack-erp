import { Entity, Column, Index, ManyToOne, JoinColumn, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Supplier group — self-referencing hierarchy for organizing providers. */
@Entity('provider_groups')
@Unique('uq_provider_group_org_code', ['organizationId', 'code'])
@Index('idx_provider_group_parent', ['parentGroupId'])
export class SupplierGroupEntity extends BaseEntity {
  @Column({ length: 50, comment: 'Group code unique per organization' })
  code: string;

  @Column({ length: 200, comment: 'Human-readable group name' })
  name: string;

  @Column({
    name: 'parent_group_id',
    type: 'uuid',
    nullable: true,
    comment: 'FK to provider_groups — creates hierarchy (self-reference)',
  })
  parentGroupId?: string;

  @ManyToOne(() => SupplierGroupEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_group_id' })
  parentGroup?: SupplierGroupEntity;

  @Column({ type: 'text', nullable: true, comment: 'Optional description' })
  description?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive groups cannot be assigned to new providers' })
  isActive: boolean;
}
