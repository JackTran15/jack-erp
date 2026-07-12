import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { BranchEntity } from '../../branch/branch.entity';

/** Physical warehouse or storage area within a branch. Contains multiple Locations. */
@Entity('storages')
@Unique(['branchId', 'name'])
export class StorageEntity extends BaseEntity {
  @Column({ nullable: true, comment: 'User-facing warehouse code (Mã kho)' })
  code?: string;

  @Column({ comment: 'Storage name (e.g. Main Warehouse, Back Storage)' })
  name: string;

  @Column({ type: 'text', nullable: true, comment: 'Free-text description (Diễn giải)' })
  description?: string;

  @Column({ name: 'is_main_storage', default: false, comment: 'If true, this is the auto-generated showroom storage (not deletable)' })
  isMainStorage: boolean;

  @Column({ name: 'is_default_receiving', default: false, comment: "Branch's single default warehouse for inbound goods" })
  isDefaultReceiving: boolean;

  @Column({ name: 'is_active', default: true, comment: 'When false, warehouse is deactivated (Ngừng hoạt động) — hidden from pickers and stock summary; ledger/report data preserved' })
  isActive: boolean;

  @ManyToOne(() => BranchEntity)
  @JoinColumn({ name: 'branch_id' })
  branch?: BranchEntity;
}
