import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockAdjustmentLineEntity } from './stock-adjustment-line.entity';

export enum AdjustmentStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

@Entity('stock_adjustments')
@Index(['organizationId', 'status'])
export class StockAdjustmentEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true })
  documentNumber?: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'reason_code' })
  reasonCode: string;

  @Column({ name: 'reason_description', nullable: true })
  reasonDescription?: string;

  @Column({
    type: 'enum',
    enum: AdjustmentStatus,
    default: AdjustmentStatus.DRAFT,
  })
  status: AdjustmentStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ nullable: true })
  notes?: string;

  @OneToMany(() => StockAdjustmentLineEntity, (line) => line.adjustment, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockAdjustmentLineEntity[];
}
