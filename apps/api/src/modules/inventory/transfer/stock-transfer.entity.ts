import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';

/** Document authorizing movement of inventory between locations/branches. Workflow: DRAFT → POSTED (or CANCELLED). */
@Entity('stock_transfers')
@Index(['organizationId', 'status'])
@Index('IDX_stock_transfers_org_branch_list', ['organizationId', 'branchId', 'status', 'createdAt'])
export class StockTransferEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated document number via DocumentNumberRule' })
  documentNumber?: string;

  @Column({ name: 'source_location_id', type: 'uuid', nullable: true, comment: 'Legacy header source location; per-line source storage/location drives the move' })
  sourceLocationId?: string;

  @Column({ name: 'destination_location_id', type: 'uuid', nullable: true, comment: 'Legacy header destination location; per-line destination storage/location drives the move' })
  destinationLocationId?: string;

  @Column({ name: 'source_branch_id', type: 'uuid', comment: 'Branch of the source location' })
  sourceBranchId: string;

  @Column({ name: 'destination_branch_id', type: 'uuid', comment: 'Branch of the destination location' })
  destinationBranchId: string;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.DRAFT, comment: 'Current workflow status (DRAFT, APPROVED, POSTED, CANCELLED)' })
  status: TransferStatus;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true, comment: 'User who approved the transfer' })
  approvedBy?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true, comment: 'When the transfer was approved' })
  approvedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true, comment: 'User who posted (finalized) the transfer' })
  postedBy?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true, comment: 'When the transfer was posted and ledger entries created' })
  postedAt?: Date;

  @Column({ name: 'transporter_user_id', type: 'uuid', nullable: true, comment: 'User responsible for transporting the goods (Người vận chuyển)' })
  transporterUserId?: string;

  @Column({ name: 'transferred_at', type: 'timestamptz', nullable: true, comment: 'When the transfer takes place (Ngày + Giờ chuyển); defaults to posting time' })
  transferredAt?: Date;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => "'[]'::jsonb", comment: 'Attachment ids (Tài liệu đính kèm)' })
  attachmentIds: string[];

  @Column({ nullable: true, comment: 'Free-text notes about the transfer' })
  notes?: string;

  @OneToMany(() => StockTransferLineEntity, (line) => line.transfer, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockTransferLineEntity[];

  /**
   * Transient (not a column): the resolved transporter user, inlined into the
   * row by list()/getById() so the FE renders the name without a second lookup.
   */
  transporter?: { id: string; fullName: string } | null;

  /**
   * Transient (not a column): sum of line_value across the transfer's lines,
   * inlined by the v2 search handler so the FE can render Tổng tiền + footer.
   */
  totalAmount?: number;
}
