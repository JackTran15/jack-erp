import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from './item.entity';
import { LocationEntity } from './location.entity';

/** Min/max stock threshold per (item, location). Null values mean "no threshold configured". */
@Entity('item_stock_thresholds')
@Unique(['itemId', 'locationId'])
@Index(['organizationId', 'locationId'])
export class ItemStockThresholdEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'min_qty', type: 'decimal', precision: 18, scale: 2, nullable: true })
  minQty?: number;

  @Column({ name: 'max_qty', type: 'decimal', precision: 18, scale: 2, nullable: true })
  maxQty?: number;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;
}
