import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';
import { StorageEntity } from './storage.entity';

@Entity('showrooms')
@Unique(['branchId', 'name'])
export class ShowroomEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'storage_id', type: 'uuid' })
  storageId: string;

  @Column({ name: 'is_main_showroom', default: false })
  isMainShowroom: boolean;

  @ManyToOne(() => StorageEntity)
  @JoinColumn({ name: 'storage_id' })
  storage?: StorageEntity;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;
}
