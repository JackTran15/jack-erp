import { Entity, Column, Unique, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemCategoryEntity } from './item-category.entity';
import { ProductEntity } from '../product/product.entity';
import { ItemProviderEntity } from './item-provider.entity';
import { ItemBarcodeEntity } from './item-barcode.entity';
import { ItemStockThresholdEntity } from './item-stock-threshold.entity';

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

  @Column({ name: 'category_id', type: 'uuid', nullable: true, comment: 'FK to inventory_item_categories' })
  categoryId?: string;

  @ManyToOne(() => ItemCategoryEntity, { nullable: true })
  @JoinColumn({ name: 'category_id' })
  category?: ItemCategoryEntity;

  @Column({ name: 'is_active', default: true, comment: 'When false, item cannot be used in new transactions' })
  isActive: boolean;

  @Column({ name: 'is_pos_visible', default: true, comment: 'When false, item is hidden from POS catalog' })
  isPosVisible: boolean;

  @Column({ name: 'purchase_price', type: 'decimal', precision: 18, scale: 2, default: 0, comment: 'Default purchase (cost) price per unit' })
  purchasePrice: number;

  @Column({ name: 'selling_price', type: 'decimal', precision: 18, scale: 2, default: 0, comment: 'Default selling price per unit' })
  sellingPrice: number;

  // ─── Physical specs ──────────────────────────────────────────────────
  @Column({ name: 'weight_gram', type: 'decimal', precision: 18, scale: 2, nullable: true, comment: 'Net weight in grams' })
  weightGram?: number;

  @Column({ name: 'length_cm', type: 'decimal', precision: 18, scale: 2, nullable: true })
  lengthCm?: number;

  @Column({ name: 'width_cm', type: 'decimal', precision: 18, scale: 2, nullable: true })
  widthCm?: number;

  @Column({ name: 'height_cm', type: 'decimal', precision: 18, scale: 2, nullable: true })
  heightCm?: number;

  @Column({ name: 'manufacture_year', type: 'smallint', nullable: true })
  manufactureYear?: number;

  @Column({ type: 'text', nullable: true, comment: 'Material composition / fabric / ingredients' })
  composition?: string;

  @Column({ name: 'product_id', type: 'uuid', nullable: true, comment: 'FK to products — null for legacy items without a parent product' })
  productId?: string;

  @ManyToOne(() => ProductEntity, { nullable: true })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ name: 'variant_label', nullable: true, comment: 'Denormalized display label for variant attributes (e.g. "39 · Nâu")' })
  variantLabel?: string;

  @OneToMany(() => ItemProviderEntity, (ip) => ip.item)
  providers?: ItemProviderEntity[];

  @OneToMany(() => ItemBarcodeEntity, (b) => b.item)
  barcodes?: ItemBarcodeEntity[];

  @OneToMany(() => ItemStockThresholdEntity, (t) => t.item)
  thresholds?: ItemStockThresholdEntity[];
}
