import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { CustomerStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

export enum Gender { MALE = 'male', FEMALE = 'female', UNSPECIFIED = 'unspecified' }

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
@Index('uq_customer_org_code', ['organizationId', 'code'], { unique: true })
export class CustomerEntity extends BaseEntity {
  @Column({ comment: 'Customers full name' })
  name: string;

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

  @Column({ length: 50, comment: 'Customer code; required and unique per org e.g. KH000017' })
  code: string;

  @Column({ name: 'birth_date', type: 'date', nullable: true, comment: 'Date of birth' })
  birthDate?: Date;

  @Column({ type: 'enum', enum: Gender, nullable: true, comment: 'Customer gender' })
  gender?: Gender;

  @Column({ name: 'national_id', length: 12, nullable: true, comment: 'CCCD / national ID number' })
  nationalId?: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: true, comment: 'FK to customer_groups' })
  groupId?: string;

  @Column({ name: 'assigned_staff_id', type: 'uuid', nullable: true, comment: 'FK to users — assigned salesperson' })
  assignedStaffId?: string;

  @Column({ type: 'text', nullable: true, comment: 'Internal notes' })
  note?: string;

  @Column({ name: 'company_name', nullable: true, comment: 'Company or business name for B2B customers' })
  companyName?: string;

  @Column({ name: 'tax_code', length: 20, nullable: true, comment: 'Business tax identification number (MST)' })
  taxCode?: string;
}
