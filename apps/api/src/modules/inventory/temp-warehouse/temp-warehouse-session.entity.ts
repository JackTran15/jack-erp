import {
  Entity,
  Column,
  Index,
  OneToMany,
  DeleteDateColumn,
} from 'typeorm';
import {
  TempWarehouseSessionStatus,
  TempWarehouseCloseMode,
  TempWarehouseTransferProcessingStatus,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { TempWarehouseLineEntity } from './temp-warehouse-line.entity';

/**
 * Header row aggregating stock movements between main warehouse and main showroom of a branch within one shift.
 * Each branch may have at most one ACTIVE session — enforced by a partial unique index in DB.
 */
@Entity('temp_warehouse_sessions')
@Index(['organizationId', 'status'])
export class TempWarehouseSessionEntity extends BaseEntity {
  @Column({
    type: 'varchar',
    length: 20,
    default: TempWarehouseSessionStatus.ACTIVE,
    comment: 'ACTIVE | CLOSED',
  })
  status: TempWarehouseSessionStatus;

  @Column({
    name: 'close_mode',
    type: 'varchar',
    length: 20,
    nullable: true,
    comment: 'NET_OFFSET | CREATE_TRANSFERS | NONE — NULL while session is ACTIVE',
  })
  closeMode?: TempWarehouseCloseMode | null;

  @Column({
    name: 'warehouse_location_id',
    type: 'uuid',
    comment: 'Resolved at session open — main storage location of the branch',
  })
  warehouseLocationId: string;

  @Column({
    name: 'showroom_location_id',
    type: 'uuid',
    comment: 'Resolved at session open — main showroom location of the branch',
  })
  showroomLocationId: string;

  @Column({ name: 'opened_by', type: 'varchar' })
  openedBy: string;

  @Column({ name: 'opened_at', type: 'timestamp' })
  openedAt: Date;

  @Column({ name: 'closed_by', type: 'varchar', nullable: true })
  closedBy?: string | null;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt?: Date | null;

  @Column({
    name: 'transfer_processing_status',
    type: 'varchar',
    length: 20,
    default: TempWarehouseTransferProcessingStatus.NONE,
    comment: 'NONE | PENDING | COMPLETED | FAILED — only != NONE when closeMode=CREATE_TRANSFERS',
  })
  transferProcessingStatus: TempWarehouseTransferProcessingStatus;

  @Column({ name: 'transfer_w2s_id', type: 'uuid', nullable: true })
  transferW2sId?: string | null;

  @Column({ name: 'transfer_s2w_id', type: 'uuid', nullable: true })
  transferS2wId?: string | null;

  @Column({ name: 'transfer_failure_reason', type: 'text', nullable: true })
  transferFailureReason?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date | null;

  @OneToMany(() => TempWarehouseLineEntity, (line) => line.session)
  lines?: TempWarehouseLineEntity[];
}
