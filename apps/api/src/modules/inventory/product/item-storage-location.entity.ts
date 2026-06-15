import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from '../location/item.entity';

/**
 * Stores the preferred/default shelf for an item (variant) within a storage.
 * Keyed per item so variants of the same product can sit on different shelves.
 * Actual stock may exist at many locations and is tracked by stock_balances.
 */
@Entity('item_storage_locations')
@Unique(['itemId', 'storageId'])
@Index(['storageId', 'locationId'])
export class ItemStorageLocationEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid', comment: 'FK to items (variant)' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @Column({ name: 'storage_id', type: 'uuid', comment: 'FK to storages — which warehouse' })
  storageId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'FK to locations — assigned position in that storage' })
  locationId: string;
}
