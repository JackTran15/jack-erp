import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

/** Lookup table for grouping customers (e.g. VIP, Wholesale). */
@Entity('customer_groups')
@Index('uq_customer_group_org_name', ['organizationId', 'name'], { unique: true })
export class CustomerGroupEntity extends BaseEntity {
  @Column({ comment: 'Group name unique per org' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
