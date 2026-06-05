import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum ItemDirection {
  OUT = 'OUT',
  IN  = 'IN',
}

export enum LineDiscountType {
  PERCENT = 'percent',
  AMOUNT = 'amount',
}

/** Single line item on a POS invoice. Snapshot columns preserve pricing at the time of sale. */
@Entity('invoice_items')
@Index(['invoiceId'])
@Index(['itemId'])
@Index('IDX_invoice_items_original_item', ['originalInvoiceItemId'])
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

  @Column({ name: 'line_discount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Discount applied to this line only (server-computed amount)' })
  lineDiscount: number;

  @Column({ name: 'line_discount_type', type: 'enum', enum: LineDiscountType, nullable: true, comment: 'Type of manual per-line discount; null = legacy raw lineDiscount only' })
  lineDiscountType?: LineDiscountType;

  @Column({ name: 'line_discount_value', type: 'numeric', precision: 18, scale: 2, nullable: true, comment: 'Raw user-entered discount value (e.g. 10 for 10%, or a currency amount)' })
  lineDiscountValue?: number;

  @Column({ name: 'line_discount_reason', type: 'varchar', length: 255, nullable: true, comment: 'Free-text label/reason for the per-line discount (e.g. "cc")' })
  lineDiscountReason?: string;

  @Column({ name: 'line_total', type: 'numeric', precision: 18, scale: 2, comment: 'Final line amount (quantity × unitPrice − lineDiscount)' })
  lineTotal: number;

  @Column({ type: 'enum', enum: ItemDirection, default: ItemDirection.OUT, comment: 'OUT = outflow (SALE / EXCHANGE new), IN = inflow (RETURN / EXCHANGE return)' })
  direction: ItemDirection;

  @Column({ name: 'returned_quantity', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Accumulator on the original SALE line: total qty already returned via RETURN/EXCHANGE' })
  returnedQuantity: number;

  @Column({ name: 'original_invoice_item_id', type: 'uuid', nullable: true, comment: 'For RETURN/EXCHANGE IN lines: FK to the original SALE invoice_item' })
  originalInvoiceItemId?: string;

  @ManyToOne(() => InvoiceItemEntity, { nullable: true })
  @JoinColumn({ name: 'original_invoice_item_id' })
  originalInvoiceItem?: InvoiceItemEntity;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note for this line item' })
  note?: string;

  @Column({ name: 'sort_order', type: 'int', default: 0, comment: 'Display ordering of lines within the invoice' })
  sortOrder: number;
}
