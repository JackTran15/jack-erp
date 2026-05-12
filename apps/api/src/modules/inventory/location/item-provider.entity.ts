import { Entity, Column, Unique, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ItemEntity } from './item.entity';
import { ProviderEntity } from './provider.entity';

/** Join row linking an item to one of its providers (suppliers). Exactly one row per item may be marked is_primary. */
@Entity('item_providers')
@Unique(['itemId', 'providerId'])
@Index(['organizationId', 'itemId'])
export class ItemProviderEntity extends BaseEntity {
  @Column({ name: 'item_id', type: 'uuid' })
  itemId: string;

  @Column({ name: 'provider_id', type: 'uuid' })
  providerId: string;

  @Column({ name: 'is_primary', default: false, comment: 'Primary supplier — used as default for PO suggestions' })
  isPrimary: boolean;

  @ManyToOne(() => ItemEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'item_id' })
  item?: ItemEntity;

  @ManyToOne(() => ProviderEntity, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;
}
