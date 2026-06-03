import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockAdjustmentLineEntity } from './stock-adjustment-line.entity';

export enum AdjustmentStatus {
  DRAFT = 'DRAFT',
  PENDING_APPROVAL = 'PENDING_APPROVAL',
  POSTED = 'POSTED',
  CANCELLED = 'CANCELLED',
}

/** Document for correcting stock quantities at a location. Workflow: DRAFT → PENDING_APPROVAL → POSTED. */
@Entity('stock_adjustments')
@Index(['organizationId', 'status'])
@Index('IDX_stock_adjustments_org_branch_list', ['organizationId', 'branchId', 'status', 'createdAt'])
export class StockAdjustmentEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated document number' })
  documentNumber?: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'The location being adjusted' })
  locationId: string;

  @Column({ name: 'reason_code', comment: 'Machine-readable reason (e.g. DAMAGE, RECOUNT, THEFT)' })
  reasonCode: string;

  @Column({ name: 'reason_description', nullable: true, comment: 'Human-readable explanation' })
  reasonDescription?: string;

  @Column({
    type: 'enum',
    enum: AdjustmentStatus,
    default: AdjustmentStatus.DRAFT,
    comment: 'Current workflow status (DRAFT, PENDING_APPROVAL, POSTED, CANCELLED)',
  })
  status: AdjustmentStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true, comment: 'User who approved the adjustment' })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true, comment: 'When approved' })
  approvedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true, comment: 'User who posted the adjustment' })
  postedBy?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true, comment: 'When posted and ledger entries created' })
  postedAt?: Date;

  @Column({ nullable: true, comment: 'Additional notes' })
  notes?: string;

  @OneToMany(() => StockAdjustmentLineEntity, (line) => line.adjustment, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockAdjustmentLineEntity[];
}
