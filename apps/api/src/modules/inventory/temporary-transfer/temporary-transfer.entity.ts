import { Entity, Column, OneToMany, Index } from 'typeorm';
import { TemporaryTransferStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { TemporaryTransferLineEntity } from './temporary-transfer-line.entity';

/** Document recording an item being moved temporarily out of a source location into the branch's temporary location (e.g. for a customer to try). */
@Entity('temporary_transfers')
@Index(['organizationId', 'status'])
@Index(['organizationId', 'branchId', 'postedAt'])
export class TemporaryTransferEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, unique: true })
  documentNumber?: string;

  @Column({ name: 'source_branch_id', type: 'uuid' })
  sourceBranchId: string;

  @Column({ name: 'destination_temp_location_id', type: 'uuid' })
  destinationTempLocationId: string;

  @Column({ name: 'carrier_user_id', type: 'uuid' })
  carrierUserId: string;

  @Column({ type: 'enum', enum: TemporaryTransferStatus, default: TemporaryTransferStatus.OPEN })
  status: TemporaryTransferStatus;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'posted_at', type: 'timestamptz' })
  postedAt: Date;

  @Column({ name: 'posted_by', type: 'uuid' })
  postedBy: string;

  @Column({ name: 'returned_at', type: 'timestamptz', nullable: true })
  returnedAt?: Date;

  @OneToMany(() => TemporaryTransferLineEntity, (line) => line.transfer, {
    cascade: ['insert'],
    eager: true,
  })
  lines: TemporaryTransferLineEntity[];
}
