import {
  Entity,
  Column,
  Index,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { TransferOrderStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { TransferOrderLineEntity } from './transfer-order-line.entity';

@Entity('transfer_orders')
@Index(['organizationId', 'status'])
export class TransferOrderEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true })
  documentNumber?: string;

  @Column({ type: 'enum', enum: TransferOrderStatus, default: TransferOrderStatus.DRAFT })
  status: TransferOrderStatus;

  @Column({ name: 'source_branch_id' })
  sourceBranchId: string;

  @Column({ name: 'destination_branch_id' })
  destinationBranchId: string;

  @Column({ name: 'source_storage_id', type: 'uuid', nullable: true })
  sourceStorageId?: string;

  @Column({ name: 'destination_storage_id', type: 'uuid', nullable: true })
  destinationStorageId?: string;

  @Column({ name: 'requested_date', type: 'date', nullable: true })
  requestedDate?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'approved_at', type: 'timestamptz', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy?: string;

  @Column({ name: 'executed_at', type: 'timestamptz', nullable: true })
  executedAt?: Date;

  @Column({ name: 'executed_by', type: 'uuid', nullable: true })
  executedBy?: string;

  @Column({ name: 'executed_transfer_id', type: 'uuid', nullable: true })
  executedTransferId?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  @OneToMany(() => TransferOrderLineEntity, (line) => line.transferOrder, {
    cascade: ['insert'],
    eager: true,
  })
  lines: TransferOrderLineEntity[];
}
