import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  TempWarehouseDirection,
  TempWarehouseLineStatus,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { TempWarehouseSessionEntity } from './temp-warehouse-session.entity';

/**
 * A single record of one item moving between the main warehouse and the main showroom.
 * Updates are done by soft-deleting (status=DELETED) and creating a new line — superseded_by_id links the two.
 */
@Entity('temp_warehouse_lines')
@Index(['sessionId', 'status'])
@Index(['sessionId', 'itemId'])
export class TempWarehouseLineEntity extends BaseEntity {
  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({
    type: 'varchar',
    length: 30,
    comment: 'warehouse_to_showroom | showroom_to_warehouse',
  })
  direction: TempWarehouseDirection;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  quantity: string;

  @Column({ name: 'carrier_user_id', type: 'uuid', nullable: true })
  carrierUserId?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: TempWarehouseLineStatus.ACTIVE,
    comment: 'ACTIVE | DELETED | AUTO_BALANCED | TRANSFERRED',
  })
  status: TempWarehouseLineStatus;

  @Column({ name: 'superseded_by_id', type: 'uuid', nullable: true })
  supersededById?: string | null;

  @Column({
    name: 'transfer_id',
    type: 'uuid',
    nullable: true,
    comment:
      'Set when this line was consumed by a partial stock transfer; null while the line is ACTIVE in the working set.',
  })
  transferId?: string | null;

  @Column({ type: 'text', nullable: true })
  notes?: string | null;

  @ManyToOne(() => TempWarehouseSessionEntity, (s) => s.lines)
  @JoinColumn({ name: 'session_id' })
  session?: TempWarehouseSessionEntity;
}
