import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TransferOrderEntity } from './transfer-order.entity';
import { ItemEntity } from '../location/item.entity';

@Entity('transfer_order_lines')
export class TransferOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @Column({ name: 'transfer_order_id', type: 'uuid' })
  transferOrderId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'requested_qty', type: 'numeric', precision: 18, scale: 3 })
  requestedQty: string;

  /** Source warehouse (storage) to pull this line from at export; null falls back to the header source storage. */
  @Column({ name: 'source_storage_id', type: 'uuid', nullable: true })
  sourceStorageId?: string;

  @Column({ type: 'text', nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => TransferOrderEntity, (to) => to.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transfer_order_id' })
  transferOrder: TransferOrderEntity;

  @ManyToOne(() => ItemEntity, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  /**
   * Source bin this line is issued from — resolved from stock (the bin holding
   * the most of this item in the source storage) at create time, so the locked
   * goods-issue form can display + submit it. Null for legacy rows / no stock.
   */
  @Column({ name: 'source_location_id', type: 'uuid', nullable: true })
  sourceLocationId?: string | null;

  // ── Transient (not persisted) ───────────────────────────────────────────────
  /** Human code of {@link sourceLocationId}, resolved in getById for the form. */
  sourceLocationCode?: string | null;
}
