import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum MembershipTier { NONE = 'none', SILVER = 'silver', GOLD = 'gold', DIAMOND = 'diamond' }

/** Loyalty/membership card linked 1-to-1 with a customer. */
@Entity('membership_cards')
@Index('uq_membership_card_customer', ['customerId'], { unique: true })
@Index('uq_membership_card_number', ['organizationId', 'cardNumber'], { unique: true })
export class MembershipCardEntity extends BaseEntity {
  @Column({ name: 'customer_id', type: 'uuid' })
  customerId: string;

  @Column({ name: 'card_number' })
  cardNumber: string;

  @Column({ type: 'enum', enum: MembershipTier, default: MembershipTier.NONE })
  tier: MembershipTier;

  @Column({ type: 'int', default: 0 })
  points: number;

  @Column({ name: 'issued_at', type: 'date' })
  issuedAt: Date;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'lomas_card_number', nullable: true })
  lomasCardNumber?: string;

  @Column({ name: 'lomas_tier', nullable: true })
  lomasTier?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
