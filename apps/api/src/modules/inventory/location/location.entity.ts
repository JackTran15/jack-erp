import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { LocationType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { StorageEntity } from './storage.entity';

@Entity('locations')
@Unique(['storageId', 'code'])
export class LocationEntity extends BaseEntity {
  @Column()
  code: string;

  @Column()
  name: string;

  @Column({ name: 'storage_id', type: 'uuid' })
  storageId: string;

  @Column({ type: 'enum', enum: LocationType })
  type: LocationType;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @ManyToOne(() => StorageEntity)
  @JoinColumn({ name: 'storage_id' })
  storage?: StorageEntity;
}
