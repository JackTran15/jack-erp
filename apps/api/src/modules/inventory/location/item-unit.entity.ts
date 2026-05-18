import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from './item.entity';

/** Unit-of-measure variant for an item (e.g. "Hộp" with ratio 12 for "Cái"). */
@Entity('item_units')
@Unique(['itemId', 'unitName'])
@Index(['organizationId', 'itemId'])
export class ItemUnitEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'unit_name', length: 50 })
  unitName: string;

  @Column({ type: 'decimal', precision: 18, scale: 4, default: 1 })
  ratio: number;

  @Column({ length: 255, nullable: true })
  description?: string;

  @Column({ name: 'purchase_price', type: 'decimal', precision: 18, scale: 2, default: 0 })
  purchasePrice: number;

  @Column({ name: 'sell_price', type: 'decimal', precision: 18, scale: 2, default: 0 })
  sellPrice: number;

  @Column({ name: 'is_default_sell', default: false })
  isDefaultSell: boolean;

  @Column({ name: 'is_default_buy', default: false })
  isDefaultBuy: boolean;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;
}
