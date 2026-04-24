import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** A stockable product or material tracked in inventory. Identified by unique code per organization. */
@Entity('items')
@Unique(['organizationId', 'code'])
export class ItemEntity extends BaseEntity {
  @Column({ comment: 'Short alphanumeric identifier (SKU) for the item' })
  code: string;

  @Column({ comment: 'Human-readable product name' })
  name: string;

  @Column({ nullable: true, comment: 'Detailed description or specifications' })
  description?: string;

  @Column({ comment: 'Unit of measure (e.g. pcs, kg, box)' })
  unit: string;

  @Column({ nullable: true, comment: 'Grouping label for filtering and reporting (e.g. Electronics, Furniture)' })
  category?: string;

  @Column({ name: 'is_active', default: true, comment: 'When false, item cannot be used in new transactions' })
  isActive: boolean;
}
