import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { LocationType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StorageEntity } from './storage.entity';

/** Specific slot within a storage (shelf, rack, bin, zone). Finest granularity for stock tracking. */
@Entity('locations')
@Unique(['storageId', 'code'])
export class LocationEntity extends BaseEntity {
  @Column({ comment: 'Short identifier for the location (e.g. A-01-03)' })
  code: string;

  @Column({ comment: 'Human-readable name (e.g. Aisle A, Rack 1, Shelf 3)' })
  name: string;

  @Column({ name: 'storage_id', type: 'uuid', comment: 'FK to storages — the storage this location belongs to' })
  storageId: string;

  @Column({ type: 'enum', enum: LocationType, comment: 'Physical type of the location (SHELF, RACK, BIN, ZONE)' })
  type: LocationType;

  @Column({ name: 'is_active', default: true, comment: 'Inactive locations cannot receive new stock' })
  isActive: boolean;

  @ManyToOne(() => StorageEntity)
  @JoinColumn({ name: 'storage_id' })
  storage?: StorageEntity;
}
