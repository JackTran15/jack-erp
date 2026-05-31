import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Brand master list (Thương hiệu). */
@Entity('inventory_brands')
@Unique('uq_inventory_brand_org_name', ['organizationId', 'name'])
export class BrandEntity extends BaseEntity {
  @Column({ length: 150, comment: 'Brand name unique per organization (e.g. Samsung, Nike)' })
  name: string;
}
