import {
  Column,
  DeleteDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashVoucherCategoryDirection } from '../enums';

@Entity('cash_voucher_categories')
@Index('UQ_cash_voucher_categories_org_code', ['organizationId', 'code'], {
  unique: true,
})
export class CashVoucherCategoryEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({
    type: 'enum',
    enum: CashVoucherCategoryDirection,
    enumName: 'cash_voucher_category_direction_enum',
  })
  direction: CashVoucherCategoryDirection;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  displayOrder: number;

  /**
   * Self-FK to the parent category (Mục cha); null for a root. Constraint and
   * index names are pinned so `migration:generate` sees the same schema that
   * 1790030000000-AddCashVoucherCategoryParentGroup created.
   */
  @Index('IDX_cash_voucher_categories_parent_group')
  @Column({ name: 'parent_group_id', type: 'uuid', nullable: true })
  parentGroupId?: string | null;

  @ManyToOne(() => CashVoucherCategoryEntity, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'parent_group_id',
    foreignKeyConstraintName: 'FK_cash_voucher_categories_parent_group',
  })
  parent?: CashVoucherCategoryEntity;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
