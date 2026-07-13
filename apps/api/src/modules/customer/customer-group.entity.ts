import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

/** Lookup table for grouping customers (e.g. VIP, Wholesale). */
@Entity('customer_groups')
@Index('uq_customer_group_org_name', ['organizationId', 'name'], { unique: true })
@Index('uq_customer_group_org_code', ['organizationId', 'code'], {
  unique: true,
  where: '"code" IS NOT NULL',
})
export class CustomerGroupEntity extends BaseEntity {
  @Column({ length: 50, nullable: true, comment: 'Group code unique per org (NKHxxxxxx)' })
  code?: string;

  @Column({ comment: 'Group name unique per org' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;
}
