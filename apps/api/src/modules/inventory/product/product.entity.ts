import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { ProviderEntity } from '../location/provider.entity';

/** A product grouping that may have multiple item variants (SKUs). Org-level, not per-branch. */
@Entity('products')
@Index(['organizationId', 'isActive'])
export class ProductEntity extends BaseEntity {
  @Column({ comment: 'Human-readable product name' })
  name: string;

  @Column({ nullable: true, comment: 'Detailed product description' })
  description?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive products are hidden from catalog' })
  isActive: boolean;

  @Column({ name: 'default_provider_id', type: 'uuid', nullable: true, comment: 'Default supplier for variants of this product' })
  defaultProviderId?: string;

  @ManyToOne(() => ProviderEntity, { nullable: true })
  @JoinColumn({ name: 'default_provider_id' })
  defaultProvider?: ProviderEntity;

  @Column({ name: 'auto_migrated', default: false, comment: 'True if created by legacy migration script (TKT-036)' })
  autoMigrated: boolean;
}
