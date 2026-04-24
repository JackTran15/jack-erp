import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';

@Entity('storages')
@Unique(['branchId', 'name'])
export class StorageEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'is_main_storage', default: false })
  isMainStorage: boolean;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;
}
