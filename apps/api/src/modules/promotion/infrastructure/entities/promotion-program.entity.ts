import { Entity, Column, DeleteDateColumn, Index } from 'typeorm';
import {
  PromotionProgramType,
  PromotionStatus,
  PromotionApplyTo,
  PromotionBirthdayMatch,
  PromotionInvoiceScope,
  PromotionDiscountMode,
  PromotionTierBasis,
  PromotionTierScope,
  PromotionTargetType,
  PromotionGiftMode,
  PromotionBuyGetPolicy,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../../database/entities/base.entity';

@Entity('promotion_programs')
@Index('uq_promotion_program_org_code', ['organizationId', 'code'], { unique: true })
@Index('IDX_promotion_programs_org_status_dates', ['organizationId', 'status', 'startDate', 'endDate'])
@Index('IDX_promotion_programs_org_priority', ['organizationId', 'priority'])
export class PromotionProgramEntity extends BaseEntity {
  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  @Column({ type: 'varchar', length: 20 })
  code: string;

  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: PromotionProgramType, enumName: 'promotion_program_type_enum' })
  type: PromotionProgramType;

  @Column({
    type: 'enum',
    enum: PromotionStatus,
    enumName: 'promotion_status_enum',
    default: PromotionStatus.TRACKING,
  })
  status: PromotionStatus;

  @Column({ type: 'int', default: 100 })
  priority: number;

  @Column({
    name: 'apply_to',
    type: 'enum',
    enum: PromotionApplyTo,
    enumName: 'promotion_apply_to_enum',
    default: PromotionApplyTo.ALL_CUSTOMERS,
  })
  applyTo: PromotionApplyTo;

  @Column({
    name: 'birthday_match',
    type: 'enum',
    enum: PromotionBirthdayMatch,
    enumName: 'promotion_birthday_match_enum',
    nullable: true,
  })
  birthdayMatch?: PromotionBirthdayMatch;

  @Column({ name: 'birthday_before_days', type: 'smallint', nullable: true })
  birthdayBeforeDays?: number;

  @Column({ name: 'birthday_after_days', type: 'smallint', nullable: true })
  birthdayAfterDays?: number;

  @Column({ name: 'card_tier_id', type: 'uuid', nullable: true })
  cardTierId?: string;

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate?: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate?: Date;

  @Column({ name: 'days_of_week', type: 'smallint', array: true, default: '{}' })
  daysOfWeek: number[];

  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime?: string;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime?: string;

  @Column({ name: 'auto_apply', type: 'boolean', default: true })
  autoApply: boolean;

  @Column({
    name: 'invoice_scope',
    type: 'enum',
    enum: PromotionInvoiceScope,
    enumName: 'promotion_invoice_scope_enum',
    nullable: true,
  })
  invoiceScope?: PromotionInvoiceScope;

  @Column({
    name: 'discount_mode',
    type: 'enum',
    enum: PromotionDiscountMode,
    enumName: 'promotion_discount_mode_enum',
    nullable: true,
  })
  discountMode?: PromotionDiscountMode;

  /** numeric column — TypeORM reads this back as a string; the mapper must Number() it. */
  @Column({ name: 'discount_value', type: 'numeric', precision: 18, scale: 2, nullable: true })
  discountValue?: string;

  @Column({ name: 'max_discount_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxDiscountAmount?: string;

  @Column({
    name: 'tier_basis',
    type: 'enum',
    enum: PromotionTierBasis,
    enumName: 'promotion_tier_basis_enum',
    nullable: true,
  })
  tierBasis?: PromotionTierBasis;

  @Column({
    name: 'tier_scope',
    type: 'enum',
    enum: PromotionTierScope,
    enumName: 'promotion_tier_scope_enum',
    nullable: true,
  })
  tierScope?: PromotionTierScope;

  @Column({
    name: 'target_type',
    type: 'enum',
    enum: PromotionTargetType,
    enumName: 'promotion_target_type_enum',
    nullable: true,
  })
  targetType?: PromotionTargetType;

  @Column({
    name: 'gift_mode',
    type: 'enum',
    enum: PromotionGiftMode,
    enumName: 'promotion_gift_mode_enum',
    nullable: true,
  })
  giftMode?: PromotionGiftMode;

  @Column({
    name: 'buy_get_policy',
    type: 'enum',
    enum: PromotionBuyGetPolicy,
    enumName: 'promotion_buy_get_policy_enum',
    nullable: true,
  })
  buyGetPolicy?: PromotionBuyGetPolicy;

  @Column({ name: 'buy_quantity', type: 'int', nullable: true })
  buyQuantity?: number;

  @Column({ name: 'gift_quantity', type: 'int', nullable: true })
  giftQuantity?: number;
}
