import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { EmployeeAddressType } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { EmployeeProfileEntity } from './employee-profile.entity';

/** Permanent or current residence address for an employee profile. */
@Entity('employee_addresses')
@Index('uq_employee_address_profile_type', ['employeeProfileId', 'type'], { unique: true })
export class EmployeeAddressEntity extends BaseEntity {
  @Column({ name: 'employee_profile_id', type: 'uuid', comment: 'FK to employee_profiles' })
  employeeProfileId: string;

  @ManyToOne(() => EmployeeProfileEntity, (p) => p.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_profile_id' })
  employeeProfile?: EmployeeProfileEntity;

  @Column({ type: 'enum', enum: EmployeeAddressType, comment: 'PERMANENT (hộ khẩu) or CURRENT (chỗ ở hiện tại)' })
  type: EmployeeAddressType;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Street address line' })
  address?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Country' })
  country?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Province / city' })
  province?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'District' })
  district?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Ward' })
  ward?: string | null;
}
