import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleEntity } from './sale.entity';

/** Single item line in a POS sale. Stock deducted from the specified location on completion. */
@Entity('pos_sale_lines')
@Index(['saleId'])
@Index(['itemId'])
export class SaleLineEntity extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid', comment: 'Parent sale transaction' })
  saleId: string;

  @ManyToOne(() => SaleEntity, (sale) => sale.lines)
  @JoinColumn({ name: 'sale_id' })
  sale: SaleEntity;

  @Column({ name: 'item_id', type: 'uuid', comment: 'The product sold' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid', comment: 'Inventory location from which stock was deducted' })
  locationId: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Quantity sold' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, comment: 'Price per unit at time of sale' })
  unitPrice: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, comment: 'Total for this line (quantity x unitPrice)' })
  lineTotal: number;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
    comment: 'Tax amount for this line',
  })
  taxAmount: number;
}
