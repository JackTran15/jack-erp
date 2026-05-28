import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** User-defined product category label (per organization), used when assigning items. */
@Entity('inventory_item_categories')
@Unique(['organizationId', 'name'])
export class ItemCategoryEntity extends BaseEntity {
  @Column({ nullable: true, comment: 'Short category code (ItemCategoryCode) — unique per org when set' })
  code?: string;

  @Column({ comment: 'Display name of the category (unique per organization)' })
  name: string;
}
