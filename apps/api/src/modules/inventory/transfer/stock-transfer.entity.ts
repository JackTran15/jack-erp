import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TransferStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockTransferLineEntity } from './stock-transfer-line.entity';

@Entity('stock_transfers')
@Index(['organizationId', 'status'])
export class StockTransferEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true })
  documentNumber?: string;

  @Column({ name: 'source_location_id', type: 'uuid' })
  sourceLocationId: string;

  @Column({ name: 'destination_location_id', type: 'uuid' })
  destinationLocationId: string;

  @Column({ name: 'source_branch_id', type: 'uuid' })
  sourceBranchId: string;

  @Column({ name: 'destination_branch_id', type: 'uuid' })
  destinationBranchId: string;

  @Column({ type: 'enum', enum: TransferStatus, default: TransferStatus.DRAFT })
  status: TransferStatus;

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

  @OneToMany(() => StockTransferLineEntity, (line) => line.transfer, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockTransferLineEntity[];
}
