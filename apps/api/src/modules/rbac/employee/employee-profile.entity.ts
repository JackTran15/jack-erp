import {
  Entity,
  Column,
  Index,
  OneToOne,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  EmployeeGender,
  MaritalStatus,
  EmploymentStatus,
  EmployeeAccessMode,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { UserEntity } from '../../auth/user.entity';
import { JobPositionEntity } from '../../hr/job-position/job-position.entity';
import { EmployeeAddressEntity } from './employee-address.entity';
import { EmployeeEmergencyContactEntity } from './employee-emergency-contact.entity';
import { EmployeeAccessScheduleEntity } from './employee-access-schedule.entity';

/** HR profile data for a user/employee. One-to-one with `users`; `users` stays auth-only. */
@Entity('employee_profiles')
@Index('uq_employee_profile_user', ['userId'], { unique: true })
@Index('uq_employee_profile_org_code', ['organizationId', 'code'], { unique: true })
@Index('idx_employee_profile_org_job', ['organizationId', 'jobPositionId'])
export class EmployeeProfileEntity extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid', comment: 'FK to users — the authenticated identity this profile belongs to' })
  userId: string;

  @OneToOne(() => UserEntity)
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;

  @Column({ length: 50, comment: 'Employee code, unique per organization (e.g. NV000002)' })
  code: string;

  @Column({ type: 'varchar', length: 30, nullable: true, comment: 'Mobile phone number' })
  mobile?: string | null;

  @Column({ name: 'home_phone', type: 'varchar', length: 30, nullable: true, comment: 'Landline / home phone' })
  homePhone?: string | null;

  @Column({ name: 'id_card_number', type: 'varchar', length: 20, nullable: true, comment: 'National ID / CMND number' })
  idCardNumber?: string | null;

  @Column({ name: 'id_card_issue_place', type: 'varchar', length: 255, nullable: true, comment: 'Place where the ID card was issued' })
  idCardIssuePlace?: string | null;

  @Column({ name: 'id_card_issue_date', type: 'date', nullable: true, comment: 'Date the ID card was issued' })
  idCardIssueDate?: string | null;

  @Column({ name: 'birth_date', type: 'date', nullable: true, comment: 'Date of birth' })
  birthDate?: string | null;

  @Column({ type: 'enum', enum: EmployeeGender, nullable: true, comment: 'Gender' })
  gender?: EmployeeGender | null;

  @Column({ name: 'marital_status', type: 'enum', enum: MaritalStatus, nullable: true, comment: 'Marital status' })
  maritalStatus?: MaritalStatus | null;

  @Column({
    name: 'employment_status',
    type: 'enum',
    enum: EmploymentStatus,
    default: EmploymentStatus.OFFICIAL,
    comment: 'HR employment status; independent from users.is_active (login flag)',
  })
  employmentStatus: EmploymentStatus;

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true, comment: 'URL of the employee photo' })
  photoUrl?: string | null;

  @Column({ name: 'job_position_id', type: 'uuid', nullable: true, comment: 'FK to job_positions' })
  jobPositionId?: string | null;

  @ManyToOne(() => JobPositionEntity, { nullable: true })
  @JoinColumn({ name: 'job_position_id' })
  jobPosition?: JobPositionEntity;

  @Column({ name: 'probation_date', type: 'date', nullable: true, comment: 'Probation start date' })
  probationDate?: string | null;

  @Column({ name: 'official_date', type: 'date', nullable: true, comment: 'Official employment start date' })
  officialDate?: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Monthly salary' })
  salary: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Deposit held' })
  deposit: number;

  @Column({ name: 'original_documents_note', type: 'varchar', length: 1000, nullable: true, comment: 'Notes on original documents on file' })
  originalDocumentsNote?: string | null;

  @Column({
    name: 'access_mode',
    type: 'enum',
    enum: EmployeeAccessMode,
    default: EmployeeAccessMode.FREE,
    comment: 'Software access mode: free anytime or restricted to scheduled time slots',
  })
  accessMode: EmployeeAccessMode;

  @OneToMany(() => EmployeeAddressEntity, (a) => a.employeeProfile)
  addresses?: EmployeeAddressEntity[];

  @OneToOne(() => EmployeeEmergencyContactEntity, (e) => e.employeeProfile)
  emergencyContact?: EmployeeEmergencyContactEntity;

  @OneToMany(() => EmployeeAccessScheduleEntity, (s) => s.employeeProfile)
  accessSchedule?: EmployeeAccessScheduleEntity[];
}
