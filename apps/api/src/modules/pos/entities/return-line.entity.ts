import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ReturnEntity } from './return.entity';

/** Single item line in a return. References the original sale line. Stock added back to location. */
@Entity('pos_return_lines')
@Index(['returnId'])
@Index(['originalSaleLineId'])
export class ReturnLineEntity extends BaseEntity {
  @Column({ name: 'return_id', type: 'uuid', comment: 'Parent return document' })
  returnId: string;

  @ManyToOne(() => ReturnEntity, (ret) => ret.lines)
  @JoinColumn({ name: 'return_id' })
  returnDoc: ReturnEntity;

  @Column({ name: 'original_sale_line_id', type: 'uuid', comment: 'The original sale line being returned' })
  originalSaleLineId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'The item being returned' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Location where returned stock is placed back' })
  locationId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Quantity being returned (always positive)' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, comment: 'Unit price at time of original sale' })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, comment: 'Total refund for this line (quantity x unitPrice)' })
  lineTotal: number;
}
