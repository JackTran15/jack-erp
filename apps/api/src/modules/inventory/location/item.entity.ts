import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProviderEntity } from './provider.entity';
import { ProductEntity } from '../product/product.entity';

/** A stockable product or material tracked in inventory. Identified by unique code per organization. */
@Entity('items')
@Unique(['organizationId', 'code'])
export class ItemEntity extends BaseEntity {
  @Column({ comment: 'Short alphanumeric identifier (SKU) for the item' })
  code: string;

  @Column({ comment: 'Human-readable product name' })
  name: string;

  @Column({ nullable: true, comment: 'Detailed description or specifications' })
  description?: string;

  @Column({ comment: 'Unit of measure (e.g. pcs, kg, box)' })
  unit: string;

  @Column({ nullable: true, comment: 'Grouping label for filtering and reporting (e.g. Electronics, Furniture)' })
  category?: string;

  @Column({ name: 'is_active', default: true, comment: 'When false, item cannot be used in new transactions' })
  isActive: boolean;

  @Column({ name: 'purchase_price', type: 'decimal', precision: 18, scale: 2, default: 0, comment: 'Default purchase (cost) price per unit' })
  purchasePrice: number;

  @Column({ name: 'selling_price', type: 'decimal', precision: 18, scale: 2, default: 0, comment: 'Default selling price per unit' })
  sellingPrice: number;

  @Column({ name: 'provider_id', type: 'uuid', comment: 'FK to inventory_providers — the supplier for this item' })
  providerId: string;

  @ManyToOne(() => ProviderEntity, { nullable: false })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @Column({ name: 'product_id', type: 'uuid', nullable: true, comment: 'FK to products — null for legacy items without a parent product' })
  productId?: string;

  @ManyToOne(() => ProductEntity, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ name: 'variant_label', nullable: true, comment: 'Denormalized display label for variant attributes (e.g. "39 · Nâu")' })
  variantLabel?: string;
}
