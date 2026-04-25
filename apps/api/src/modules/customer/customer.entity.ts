import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

/** Customer who purchases goods. Supports deduplication via merge workflow. */
@Entity('customers')
@Index('uq_customer_org_email', ['organizationId', 'email'], {
  unique: true,
  where: '"email" IS NOT NULL',
})
@Index('idx_customer_org_status', ['organizationId', 'status'])
@Index('uq_customer_org_phone', ['organizationId', 'phone'], {
  unique: true,
  where: '"phone" IS NOT NULL',
})
export class CustomerEntity extends BaseEntity {
  @Column({ name: 'first_name', comment: 'Customers given name' })
  firstName: string;

  @Column({ name: 'last_name', comment: 'Customers family name' })
  lastName: string;

  @Column({ nullable: true, comment: 'Email address; optional but unique within org when provided' })
  email?: string;

  @Column({
    nullable: true,
    comment: 'Phone number for contact or lookup at POS; unique within organization when set',
  })
  phone?: string;

  @Column({ nullable: true, comment: 'Mailing or billing address' })
  address?: string;

  @Column({
    type: 'enum',
    enum: CustomerStatus,
    default: CustomerStatus.ACTIVE,
    comment: 'Customer lifecycle status (ACTIVE, INACTIVE, MERGED)',
  })
  status: CustomerStatus;

  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true, comment: 'FK to customers — points to surviving customer after a merge' })
  mergedIntoId?: string;

  @ManyToOne(() => CustomerEntity, { nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  mergedInto?: CustomerEntity;
}
