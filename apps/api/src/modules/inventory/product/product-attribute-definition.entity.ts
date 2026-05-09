import { Entity, Column, Unique, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProductEntity } from './product.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';

/** A dimension of variation for a product (e.g. Size, Color). */
@Entity('product_attribute_definitions')
@Unique(['productId', 'name'])
export class ProductAttributeDefinitionEntity extends BaseEntity {
  @Column({ name: 'product_id', type: 'uuid', comment: 'FK to products — the product this attribute belongs to' })
  productId: string;

  @ManyToOne(() => ProductEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product?: ProductEntity;

  @Column({ comment: 'Attribute dimension name (e.g. Size, Color)' })
  name: string;

  @Column({ name: 'sort_order', type: 'int', default: 0, comment: 'Display ordering among sibling definitions' })
  sortOrder: number;

  @OneToMany(() => ProductAttributeOptionEntity, (o) => o.attributeDefinition, { cascade: true })
  options?: ProductAttributeOptionEntity[];
}
