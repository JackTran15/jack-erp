import {
  Entity,
  Column,
  Index,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import { StockTakeStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StockTakeLineEntity } from './stock-take-line.entity';

@Entity('stock_takes')
@Index(['organizationId', 'status'])
export class StockTakeEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true })
  documentNumber?: string;

  @Column({ type: 'enum', enum: StockTakeStatus, default: StockTakeStatus.DRAFT })
  status: StockTakeStatus;

  @Column({ name: 'storage_id', type: 'uuid', nullable: true })
  storageId?: string;

  @Column({ name: 'location_id', type: 'uuid', nullable: true })
  locationId?: string;

  @Column({ name: 'snapshot_at', type: 'timestamptz' })
  snapshotAt: Date;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  @OneToMany(() => StockTakeLineEntity, (line) => line.stockTake, {
    cascade: ['insert'],
    eager: true,
  })
  lines: StockTakeLineEntity[];
}
