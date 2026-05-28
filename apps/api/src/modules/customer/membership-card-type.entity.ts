import { Column, DeleteDateColumn, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';
import { MembershipTier } from './membership-card.entity';

@Entity('membership_card_types')
@Index('UQ_membership_card_types_org_tier', ['organizationId', 'tier'], { unique: true })
export class MembershipCardTypeEntity extends BaseEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: MembershipTier,
    enumName: 'membership_tier_enum',
  })
  tier: MembershipTier;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;
}
