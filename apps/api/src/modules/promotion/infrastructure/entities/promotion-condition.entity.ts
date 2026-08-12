import { Entity, Column, Index } from 'typeorm';
import { PromotionConditionType, PromotionCalcBasis, PromotionGroupMatchMode } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../../database/entities/base.entity';

@Entity('promotion_conditions')
@Index('uq_promotion_condition_program', ['programId'], { unique: true })
export class PromotionConditionEntity extends BaseEntity {
  @Column({ name: 'program_id', type: 'uuid' })
  programId: string;

  @Column({
    type: 'enum',
    enum: PromotionConditionType,
    enumName: 'promotion_condition_type_enum',
    default: PromotionConditionType.NONE,
  })
  type: PromotionConditionType;

  @Column({ name: 'min_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  minAmount?: string | null;

  @Column({
    name: 'calc_basis',
    type: 'enum',
    enum: PromotionCalcBasis,
    enumName: 'promotion_calc_basis_enum',
    nullable: true,
  })
  calcBasis?: PromotionCalcBasis;

  @Column({
    name: 'group_match_mode',
    type: 'enum',
    enum: PromotionGroupMatchMode,
    enumName: 'promotion_group_match_mode_enum',
    nullable: true,
  })
  groupMatchMode?: PromotionGroupMatchMode;

  @Column({ name: 'multiply_gift', type: 'boolean', default: false })
  multiplyGift: boolean;
}
