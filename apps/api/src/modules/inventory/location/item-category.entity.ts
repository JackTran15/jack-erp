import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum ItemCategoryStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

/** User-defined product category label (per organization), used when assigning items. */
@Entity('inventory_item_categories')
@Unique(['organizationId', 'name'])
export class ItemCategoryEntity extends BaseEntity {
  @Column({ length: 50, nullable: true, comment: 'Optional category code shown in catalogs' })
  code?: string;

  @Column({ comment: 'Display name of the category (unique per organization)' })
  name: string;

  @Column({ length: 500, nullable: true, comment: 'Optional category description' })
  description?: string;

  @Column({
    type: 'enum',
    enum: ItemCategoryStatus,
    enumName: 'inventory_item_category_status_enum',
    default: ItemCategoryStatus.ACTIVE,
    comment: 'Business status of the category in catalogs',
  })
  status: ItemCategoryStatus;

  @Column({
    name: 'parent_group_id',
    type: 'uuid',
    nullable: true,
    comment: 'Self-FK to the parent category; null for a root group',
  })
  parentGroupId?: string | null;

  @ManyToOne(() => ItemCategoryEntity, { nullable: true })
  @JoinColumn({ name: 'parent_group_id' })
  parent?: ItemCategoryEntity;
}
