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
}
