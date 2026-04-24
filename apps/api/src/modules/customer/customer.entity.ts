import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

@Entity('customers')
@Index('uq_customer_org_email', ['organizationId', 'email'], {
  unique: true,
  where: '"email" IS NOT NULL',
})
@Index('idx_customer_org_status', ['organizationId', 'status'])
@Index('idx_customer_org_phone', ['organizationId', 'phone'])
export class CustomerEntity extends BaseEntity {
  @Column({ name: 'first_name' })
  firstName: string;

  @Column({ name: 'last_name' })
  lastName: string;

  @Column({ nullable: true })
  email?: string;

  @Column({ nullable: true })
  phone?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({
    type: 'enum',
    enum: CustomerStatus,
    default: CustomerStatus.ACTIVE,
  })
  status: CustomerStatus;

  @Column({ name: 'merged_into_id', type: 'uuid', nullable: true })
  mergedIntoId?: string;

  @ManyToOne(() => CustomerEntity, { nullable: true })
  @JoinColumn({ name: 'merged_into_id' })
  mergedInto?: CustomerEntity;
}
