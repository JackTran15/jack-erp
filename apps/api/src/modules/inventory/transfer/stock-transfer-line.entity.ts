import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { StockTransferEntity } from './stock-transfer.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';
import { StorageEntity } from '../location/storage.entity';

/** Single item line within a stock transfer document. */
@Entity('stock_transfer_lines')
export class StockTransferLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'transfer_id', type: 'uuid', comment: 'Parent transfer document' })
  transferId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being transferred' })
  itemId: string;

  @Column({
    name: 'source_storage_id',
    type: 'uuid',
    nullable: true,
    comment: 'Per-line source storage (warehouse stock is sent from). Must belong to the actor branch.',
  })
  sourceStorageId?: string;

  @Column({
    name: 'destination_storage_id',
    type: 'uuid',
    nullable: true,
    comment: 'Per-line destination storage (warehouse stock is received into). Must belong to the actor branch.',
  })
  destinationStorageId?: string;

  @Column({
    name: 'source_location_id',
    type: 'uuid',
    nullable: true,
    comment: 'Per-line source location; resolves to the source storage unassigned location when omitted',
  })
  sourceLocationId?: string;

  @Column({
    name: 'destination_location_id',
    type: 'uuid',
    nullable: true,
    comment: 'Per-line destination location; resolves to the destination storage unassigned location when omitted',
  })
  destinationLocationId?: string;

  @Column({ type: 'numeric', comment: 'Quantity to transfer (always positive)' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    comment: 'Export unit price; resolved from the snapshot item cost when left blank',
  })
  unitPrice?: string | null;

  @Column({
    name: 'line_value',
    type: 'numeric',
    precision: 18,
    scale: 2,
    nullable: true,
    comment: 'Line total = unitPrice * quantity',
  })
  lineValue?: string | null;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => StockTransferEntity, (transfer) => transfer.lines, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'transfer_id' })
  transfer?: StockTransferEntity;

  @ManyToOne(() => ItemEntity, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'source_location_id' })
  sourceLocation?: LocationEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'destination_location_id' })
  destinationLocation?: LocationEntity;

  @ManyToOne(() => StorageEntity, { eager: true })
  @JoinColumn({ name: 'source_storage_id' })
  sourceStorage?: StorageEntity;

  @ManyToOne(() => StorageEntity, { eager: true })
  @JoinColumn({ name: 'destination_storage_id' })
  destinationStorage?: StorageEntity;
}
