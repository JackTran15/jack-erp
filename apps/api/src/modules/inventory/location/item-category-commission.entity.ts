import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** How a category-level commission value is interpreted (Cách tính hoa hồng). */
export enum CommissionMethod {
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

/**
 * Commission rule attached to an item category (Hoa hồng theo nhóm hàng).
 * One category may carry several rules — one per job position.
 */
@Entity('inventory_item_category_commissions')
@Index('idx_item_category_commission_category', ['categoryId'])
export class ItemCategoryCommissionEntity extends BaseEntity {
  @Column({ name: 'category_id', type: 'uuid', comment: 'FK to inventory_item_categories' })
  categoryId: string;

  @Column({ name: 'position_id', type: 'uuid', nullable: true, comment: 'Soft reference to an HR job position (job_positions.id)' })
  positionId?: string;

  @Column({ name: 'position_name', nullable: true, comment: 'Denormalized job position label (Vị trí công việc)' })
  positionName?: string;

  @Column({ type: 'varchar', length: 20, default: CommissionMethod.PERCENT, comment: 'Commission calculation method (Cách tính hoa hồng)' })
  method: CommissionMethod;

  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0, comment: 'Commission rate (percent) or fixed amount (Mức tính)' })
  rate: number;

  @Column({ name: 'discount_limit_percent', type: 'numeric', precision: 9, scale: 4, default: 0, comment: 'Max discount % still eligible for commission (Giới hạn giảm giá được tính hoa hồng %)' })
  discountLimitPercent: number;
}
