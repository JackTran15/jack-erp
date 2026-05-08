import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum PromotionType {
  ORDER_DISCOUNT = 'order_discount',
  GIFT_PRODUCT = 'gift_product',
  BUY_X_GET_Y = 'buy_x_get_y',
  PRODUCT_DISCOUNT = 'product_discount',
}

@Entity('promotions')
@Index(['organizationId', 'isActive'])
export class PromotionEntity extends BaseEntity {
  @Column({ type: 'varchar', nullable: false })
  name: string;

  @Column({ type: 'enum', enum: PromotionType, nullable: false })
  type: PromotionType;

  @Column({ type: 'jsonb', nullable: true })
  conditions: object;

  @Column({ type: 'jsonb', nullable: true })
  benefits: object;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_from' })
  validFrom: Date;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_to' })
  validTo: Date;

  @Column({ type: 'text', array: true, default: '{}', name: 'applicable_branch_ids' })
  applicableBranchIds: string[];

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;
}
