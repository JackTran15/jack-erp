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

  @Column({ type: 'text', nullable: true, comment: 'Free-text description / note for this location (Mô tả)' })
  description?: string | null;

  @Column({ name: 'is_active', default: true, comment: 'Inactive locations cannot receive new stock' })
  isActive: boolean;

  @Column({
    name: 'is_unassigned',
    default: false,
    comment: 'Virtual "Chưa xếp" location — holds stock not yet arranged onto a real shelf (one per storage)',
  })
  isUnassigned: boolean;

  @ManyToOne(() => StorageEntity)
  @JoinColumn({ name: 'storage_id' })
  storage?: StorageEntity;

  /**
   * Transient (not a column): whether any item has been placed at this location
   * (has ≥1 stock_balance row). Populated by listLocations to drive the
   * "Xếp hàng hóa: Đã xếp / Chưa xếp" column. Undefined on endpoints that don't compute it.
   */
  hasItems?: boolean;
}
