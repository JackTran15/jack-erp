import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashCountStatus, CashCountVarianceVoucherKind } from '../enums';

export interface CashCountDenomination {
  denom: number;
  count: number;
  /** Per-line note ("Diễn giải") for this denomination row. */
  description?: string;
}

@Entity('cash_counts')
@Index('IDX_cash_counts_org_status', ['organizationId', 'status'])
@Index('IDX_cash_counts_account_counted_at', ['cashAccountId', 'countedAt'])
export class CashCountEntity extends BaseEntity {
  @Column({ name: 'document_number', type: 'varchar', length: 64, nullable: true })
  documentNumber?: string;

  @Column({ name: 'cash_account_id', type: 'uuid' })
  cashAccountId: string;

  @Column({ name: 'counted_at', type: 'timestamptz' })
  countedAt: Date;

  @Column({ name: 'expected_amount', type: 'numeric', precision: 18, scale: 2, nullable: true })
  expectedAmount?: number;

  @Column({ name: 'actual_amount', type: 'numeric', precision: 18, scale: 2 })
  actualAmount: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  variance?: number;

  /** "Mục đích" — free-text purpose written by the user on the form. */
  @Column({ type: 'text', nullable: true })
  purpose?: string;

  @Column({
    type: 'enum',
    enum: CashCountStatus,
    enumName: 'cash_count_status_enum',
    default: CashCountStatus.DRAFT,
  })
  status: CashCountStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'jsonb', nullable: true })
  denominations?: CashCountDenomination[];

  @Column({ name: 'variance_cash_movement_id', type: 'uuid', nullable: true })
  varianceCashMovementId?: string;

  @Column({
    name: 'variance_voucher_kind',
    type: 'enum',
    enum: CashCountVarianceVoucherKind,
    enumName: 'cash_count_variance_voucher_kind_enum',
    nullable: true,
  })
  varianceVoucherKind?: CashCountVarianceVoucherKind;

  @Column({ name: 'variance_voucher_id', type: 'uuid', nullable: true })
  varianceVoucherId?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
