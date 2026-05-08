import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Single line item on a POS invoice. Snapshot columns preserve pricing at the time of sale. */
@Entity('invoice_items')
@Index(['invoiceId'])
@Index(['itemId'])
export class InvoiceItemEntity extends BaseEntity {
  @Column({ name: 'invoice_id', type: 'uuid', comment: 'Parent invoice this line belongs to' })
  invoiceId: string;

  @Column({ name: 'item_id', type: 'uuid', comment: 'Live reference to the catalogue item (for reporting)' })
  itemId: string;

  @Column({ name: 'location_id', type: 'uuid', nullable: true, comment: 'Inventory location the stock was drawn from at sale time' })
  locationId?: string;

  @Column({ name: 'item_code', comment: 'Snapshot of the item code at sale time' })
  itemCode: string;

  @Column({ name: 'item_name', comment: 'Snapshot of the item name at sale time' })
  itemName: string;

  @Column({ comment: 'Snapshot of the unit of measure at sale time (e.g. "pcs", "kg")' })
  unit: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, comment: 'Number of units sold' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2, comment: 'Snapshot of the selling price per unit at sale time' })
  unitPrice: number;

  @Column({ name: 'unit_price_default', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Default catalogue selling price at sale time (server-populated, not from client)' })
  unitPriceDefault: number;

  @Column({ name: 'cost_price', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Cost price (COGS) at sale time (server-populated, not from client)' })
  costPrice: number;

  @Column({ name: 'line_discount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Discount applied to this line only' })
  lineDiscount: number;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, comment: 'Final line amount (quantity × unitPrice − lineDiscount)' })
  lineTotal: number;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note for this line item' })
  note?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0, comment: 'Display ordering of lines within the invoice' })
  sortOrder: number;
}
