import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { SaleEntity } from './sale.entity';

@Entity('pos_sale_lines')
@Index(['saleId'])
@Index(['itemId'])
export class SaleLineEntity extends BaseEntity {
  @Column({ name: 'sale_id', type: 'uuid' })
  saleId: string;

  @ManyToOne(() => SaleEntity, (sale) => sale.lines)
  @JoinColumn({ name: 'sale_id' })
  sale: SaleEntity;

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

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 18,
    scale: 2,
    default: 0,
  })
  taxAmount: number;
}
