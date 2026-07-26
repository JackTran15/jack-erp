import { Entity, Column, Index } from 'typeorm';
import { PromotionDiscountMode } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../../database/entities/base.entity';

@Entity('promotion_tiers')
@Index('IDX_promotion_tiers_group_from', ['groupId', 'fromValue'])
export class PromotionTierEntity extends BaseEntity {
  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId: string;

  @Column({ name: 'from_value', type: 'numeric', precision: 18, scale: 2 })
  fromValue: string;

  /** null = unbounded (infinity). */
  @Column({ name: 'to_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  toValue?: string;

  @Column({ name: 'discount_mode', type: 'enum', enum: PromotionDiscountMode, enumName: 'promotion_discount_mode_enum' })
  discountMode: PromotionDiscountMode;

  @Column({ name: 'discount_value', type: 'numeric', precision: 18, scale: 2 })
  discountValue: string;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
