import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { Weekday } from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { EmployeeProfileEntity } from './employee-profile.entity';

/** Per-weekday software access time window for an employee (used when access_mode = SCHEDULED). */
@Entity('employee_access_schedules')
@Index('uq_employee_access_profile_weekday', ['employeeProfileId', 'weekday'], { unique: true })
export class EmployeeAccessScheduleEntity extends BaseEntity {
  @Column({ name: 'employee_profile_id', type: 'uuid', comment: 'FK to employee_profiles' })
  employeeProfileId: string;

  @ManyToOne(() => EmployeeProfileEntity, (p) => p.accessSchedule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_profile_id' })
  employeeProfile?: EmployeeProfileEntity;

  @Column({ type: 'enum', enum: Weekday, comment: 'Day of week this window applies to' })
  weekday: Weekday;

  @Column({ default: true, comment: 'Whether access is allowed on this day' })
  enabled: boolean;

  @Column({ name: 'start_time', type: 'time', default: '00:00', comment: 'Window start (HH:mm)' })
  startTime: string;

  @Column({ name: 'end_time', type: 'time', default: '23:59', comment: 'Window end (HH:mm)' })
  endTime: string;
}
