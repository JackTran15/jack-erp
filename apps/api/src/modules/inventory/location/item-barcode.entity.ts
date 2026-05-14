import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from './item.entity';

/** Additional barcode(s) attached to an item (manufacturer EAN, internal codes). Unique per organization. */
@Entity('item_barcodes')
@Unique(['organizationId', 'code'])
export class ItemBarcodeEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ length: 100, comment: 'Barcode string, alphanumeric + - _ .' })
  code: string;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note (e.g. supplier-side code label)' })
  notes?: string;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;
}
