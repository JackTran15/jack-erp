import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProductEntity } from './product.entity';

/**
 * Stores the preferred/default shelf for a product within a storage.
 * Actual stock may exist at many locations and is tracked by stock_balances.
 */
@Entity('product_storage_locations')
@Unique(['productId', 'storageId'])
@Index(['storageId', 'locationId'])
export class ProductStorageLocationEntity extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid', comment: 'FK to products' })
  productId: string;

  @ManyToOne(() => ProductEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ name: 'storage_id', type: 'uuid', comment: 'FK to storages — which warehouse' })
  storageId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'FK to locations — assigned position in that storage' })
  locationId: string;
}
