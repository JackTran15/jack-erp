import { Entity, Column, Index, OneToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';
import { EmployeeProfileEntity } from './employee-profile.entity';

/** Emergency contact for an employee profile (1:1). */
@Entity('employee_emergency_contacts')
@Index('uq_employee_emergency_profile', ['employeeProfileId'], { unique: true })
export class EmployeeEmergencyContactEntity extends BaseEntity {
  @Column({ name: 'employee_profile_id', type: 'uuid', comment: 'FK to employee_profiles' })
  employeeProfileId: string;

  @OneToOne(() => EmployeeProfileEntity, (p) => p.emergencyContact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_profile_id' })
  employeeProfile?: EmployeeProfileEntity;

  @Column({ name: 'full_name', type: 'varchar', length: 255, nullable: true, comment: 'Contact full name' })
  fullName?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Relationship to the employee' })
  relationship?: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, comment: 'Mobile phone' })
  mobile?: string | null;

  @Column({ name: 'home_phone', type: 'varchar', length: 30, nullable: true, comment: 'Home phone' })
  homePhone?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, comment: 'Email address' })
  email?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true, comment: 'Address' })
  address?: string | null;
}
