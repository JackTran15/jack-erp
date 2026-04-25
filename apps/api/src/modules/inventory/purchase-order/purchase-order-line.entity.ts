import { Entity, Column, ManyToOne, JoinColumn, PrimaryGeneratedColumn } from 'typeorm';
import { PurchaseOrderEntity } from './purchase-order.entity';

/** Single item line within a purchase order. */
@Entity('purchase_order_lines')
export class PurchaseOrderLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'purchase_order_id', type: 'uuid', comment: 'Parent purchase order' })
  purchaseOrderId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'Item being ordered' })
  itemId: string;

  @Column({ name: 'ordered_quantity', type: 'numeric', comment: 'Quantity ordered from supplier' })
  orderedQuantity: number;

  @Column({ name: 'received_quantity', type: 'numeric', default: 0, comment: 'Quantity already received into stock' })
  receivedQuantity: number;

  @Column({ name: 'unit_price', type: 'numeric', default: 0, comment: 'Unit purchase price' })
  unitPrice: number;

  @Column({ nullable: true, comment: 'Per-line notes' })
  notes?: string;

  @ManyToOne(() => PurchaseOrderEntity, (po) => po.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder?: PurchaseOrderEntity;
}
