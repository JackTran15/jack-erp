import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProductEntity } from './product.entity';

/**
 * Maps a product to exactly one location within a storage.
 * Constraint: one product can only be stored in one location per storage (warehouse).
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
