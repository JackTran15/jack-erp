import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Unit of measure master list (Đơn vị tính). */
@Entity('inventory_units')
@Unique('uq_inventory_unit_org_name', ['organizationId', 'name'])
export class UnitOfMeasureEntity extends BaseEntity {
  @Column({ length: 50, comment: 'Unit name unique per organization (e.g. Cái, Bộ, Hộp)' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: 'Optional description (Diễn giải)' })
  description?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive units are hidden from pickers' })
  isActive: boolean;
}
