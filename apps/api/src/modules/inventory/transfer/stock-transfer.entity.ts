import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';

/** Document authorizing movement of inventory between locations/branches. Workflow: DRAFT → APPROVED → POSTED. */
@Entity('stock_transfers')
@Index(['organizationId', 'status'])
export class StockTransferEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true, comment: 'Auto-generated document number via DocumentNumberRule' })
  documentNumber?: string;

  @Column({ name: 'source_location_id', type: 'uuid', comment: 'Location from which stock is being sent' })
  sourceLocationId: string;

  @Column({ name: 'destination_location_id', type: 'uuid', comment: 'Location receiving the stock' })
  destinationLocationId: string;

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

  @Column({ nullable: true, comment: 'Free-text notes about the transfer' })
  notes?: string;

  @OneToMany(() => StockTransferLineEntity, (line) => line.transfer, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockTransferLineEntity[];
}
