import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
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

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
