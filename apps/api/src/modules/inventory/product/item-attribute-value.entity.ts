import { Entity, Column, Unique, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from '../location/item.entity';
import { ProductAttributeDefinitionEntity } from './product-attribute-definition.entity';
import { ProductAttributeOptionEntity } from './product-attribute-option.entity';

/** Junction: links an item (variant) to one option per attribute dimension. */
@Entity('item_attribute_values')
@Unique(['itemId', 'attributeDefinitionId'])
export class ItemAttributeValueEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid', comment: 'FK to items — the variant item' })
  itemId: string;

  @ManyToOne(() => ItemEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @Column({ name: 'attribute_definition_id', type: 'uuid', comment: 'FK to attribute definition (which dimension)' })
  attributeDefinitionId: string;

  @ManyToOne(() => ProductAttributeDefinitionEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'attribute_definition_id' })
  attributeDefinition?: ProductAttributeDefinitionEntity;

  @Column({ name: 'option_id', type: 'uuid', comment: 'FK to attribute option (which value in that dimension)' })
  optionId: string;

  @ManyToOne(() => ProductAttributeOptionEntity, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'option_id' })
  option?: ProductAttributeOptionEntity;
}
