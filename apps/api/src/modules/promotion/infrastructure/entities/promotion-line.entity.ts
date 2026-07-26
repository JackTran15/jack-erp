import { Entity, Column, Index } from 'typeorm';
import { PromotionLineRole, PromotionTargetType, PromotionDiscountMode } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../../database/entities/base.entity';

@Entity('promotion_lines')
@Index('IDX_promotion_lines_program', ['programId'])
@Index('IDX_promotion_lines_org_target', ['organizationId', 'targetType', 'targetId'])
export class PromotionLineEntity extends BaseEntity {
  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ type: 'enum', enum: PromotionLineRole, enumName: 'promotion_line_role_enum' })
  role: PromotionLineRole;

  @Column({ name: 'target_type', type: 'enum', enum: PromotionTargetType, enumName: 'promotion_target_type_enum' })
  targetType: PromotionTargetType;

  /** Polymorphic across items/products/inventory_item_categories — deliberately not an FK. */
  @Column({ name: 'target_id', type: 'uuid' })
  targetId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  quantity?: string;

  @Column({
    name: 'discount_mode',
    type: 'enum',
    enum: PromotionDiscountMode,
    enumName: 'promotion_discount_mode_enum',
    nullable: true,
  })
  discountMode?: PromotionDiscountMode;

  @Column({ name: 'discount_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  discountValue?: string;

  /** "Selling price <=" filter column on the gift-item grid (FR-033). */
  @Column({ name: 'max_unit_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxUnitPrice?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
