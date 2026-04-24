import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReturnEntity } from './return.entity';

@Entity('pos_return_lines')
@Index(['returnId'])
@Index(['originalSaleLineId'])
export class ReturnLineEntity extends BaseEntity {
  @Column({ name: 'return_id', type: 'uuid' })
  returnId: string;

  @ManyToOne(() => ReturnEntity, (ret) => ret.lines)
  @JoinColumn({ name: 'return_id' })
  returnDoc: ReturnEntity;

  @Column({ name: 'original_sale_line_id', type: 'uuid' })
  originalSaleLineId: string;

  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2 })
  lineTotal: number;
}
