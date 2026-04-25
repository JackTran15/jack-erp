import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Supplier / vendor who provides items to the organization. */
@Entity('inventory_providers')
@Unique(['organizationId', 'code'])
export class ProviderEntity extends BaseEntity {
  @Column({ comment: 'Short alphanumeric code unique per organization' })
  code: string;

  @Column({ comment: 'Human-readable provider name' })
  name: string;

  @Column({ nullable: true, comment: 'Contact email address' })
  email?: string;

  @Column({ nullable: true, comment: 'Contact phone number' })
  phone?: string;

  @Column({ nullable: true, comment: 'Free-text notes or address info' })
  notes?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive providers cannot be assigned to new items' })
  isActive: boolean;
}
