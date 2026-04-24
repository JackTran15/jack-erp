import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { StorageEntity } from './storage.entity';

/** Display/sales floor area linked to a branch and backed by a storage. */
@Entity('showrooms')
@Unique(['branchId', 'name'])
export class ShowroomEntity extends BaseEntity {
  @Column({ comment: 'Showroom display name' })
  name: string;

  @Column({ name: 'storage_id', type: 'uuid', comment: 'FK to storages — the storage backing this showrooms inventory' })
  storageId: string;

  @Column({ name: 'is_main_showroom', default: false, comment: 'If true, this is the branchs primary showroom' })
  isMainShowroom: boolean;

  @ManyToOne(() => StorageEntity)
  @JoinColumn({ name: 'storage_id' })
  storage?: StorageEntity;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;
}
