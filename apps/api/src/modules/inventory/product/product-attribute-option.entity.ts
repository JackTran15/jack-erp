import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';

/** A specific value within an attribute dimension (e.g. "39", "Nâu"). */
@Entity('product_attribute_options')
@Index(['attributeDefinitionId'])
export class ProductAttributeOptionEntity extends BaseEntity {
  @Column({ name: 'attribute_definition_id', type: 'uuid', comment: 'FK to the parent attribute definition' })
  attributeDefinitionId: string;

  @ManyToOne(() => ProductAttributeDefinitionEntity, (d) => d.options, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_definition_id' })
  attributeDefinition?: ProductAttributeDefinitionEntity;

  @Column({ name: 'value_label', comment: 'Display label for the option value' })
  valueLabel: string;

  @Column({ name: 'sort_order', type: 'int', default: 0, comment: 'Display ordering among sibling options' })
  sortOrder: number;

  @Column({ name: 'code_suffix', nullable: true, comment: 'Short code appended to SKU when generating variant codes' })
  codeSuffix?: string;
}
