import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { GoodsReceiptEntity } from './goods-receipt.entity';
import { ItemEntity } from '../location/item.entity';
import { LocationEntity } from '../location/location.entity';

@Entity('goods_receipt_lines')
export class GoodsReceiptLineEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id' })
  organizationId: string;

  @Column({ name: 'branch_id', nullable: true })
  branchId?: string;

  @Column({ name: 'goods_receipt_id', type: 'uuid' })
  goodsReceiptId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'bin_id', type: 'uuid', nullable: true })
  binId?: string;

  @Column({ name: 'uom_code', length: 50 })
  uomCode: string;

  @Column({ type: 'numeric', precision: 18, scale: 3 })
  quantity: string;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, default: 0 })
  unitPrice: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, default: 0 })
  lineTotal: string;

  @Column({ length: 500, nullable: true })
  note?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by' })
  createdBy: string;

  @ManyToOne(() => GoodsReceiptEntity, (gr) => gr.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'goods_receipt_id' })
  goodsReceipt: GoodsReceiptEntity;

  @ManyToOne(() => ItemEntity, { eager: true })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;
}
