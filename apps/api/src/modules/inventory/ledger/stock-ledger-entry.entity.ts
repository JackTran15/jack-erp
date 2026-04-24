import { Entity, Column, Index } from 'typeorm';
import { StockMovementType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';

@Entity('stock_ledger_entries')
@Index(['organizationId', 'itemId', 'locationId'])
@Index(['organizationId', 'branchId', 'createdAt'])
export class StockLedgerEntryEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ type: 'enum', enum: StockMovementType, name: 'movement_type' })
  movementType: StockMovementType;

  @Column({ type: 'numeric' })
  quantity: number;

  @Column({ name: 'reference_type' })
  referenceType: string;

  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId: string;

  @Column({ nullable: true })
  notes?: string;

  @Column({ name: 'posted_at', type: 'timestamptz' })
  postedAt: Date;
}
