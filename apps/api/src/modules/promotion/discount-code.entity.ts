import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum DiscountType {
  PERCENTAGE = 'percentage',
  FIXED_AMOUNT = 'fixed_amount',
}

@Entity('discount_codes')
@Index('uq_discount_code_org', ['organizationId', 'code'], { unique: true })
export class DiscountCodeEntity extends BaseEntity {
  @Column({ type: 'varchar', nullable: false })
  code: string;

  @Column({ type: 'enum', enum: DiscountType, nullable: false, name: 'discount_type' })
  discountType: DiscountType;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: false, name: 'discount_value' })
  discountValue: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, name: 'min_order_value' })
  minOrderValue: number;

  @Column({ type: 'int', nullable: true, name: 'max_uses' })
  maxUses?: number;

  @Column({ type: 'int', default: 0, name: 'used_count' })
  usedCount: number;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_from' })
  validFrom: Date;

  @Column({ type: 'timestamptz', nullable: false, name: 'valid_to' })
  validTo: Date;

  @Column({ type: 'boolean', default: true, name: 'is_active' })
  isActive: boolean;
}
