import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';

/** Physical warehouse or storage area within a branch. Contains multiple Locations. */
@Entity('storages')
@Unique(['branchId', 'name'])
export class StorageEntity extends BaseEntity {
  @Column({ comment: 'Storage name (e.g. Main Warehouse, Back Storage)' })
  name: string;

  @Column({ name: 'is_main_storage', default: false, comment: 'If true, this is the branchs default storage for receiving goods' })
  isMainStorage: boolean;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;
}
