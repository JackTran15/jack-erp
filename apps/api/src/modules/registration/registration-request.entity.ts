import { Entity, Column } from 'typeorm';
import { RegistrationStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

export enum RegistrationType {
  ORGANIZATION = 'ORGANIZATION',
  BRANCH = 'BRANCH',
}

@Entity('registration_requests')
export class RegistrationRequestEntity extends BaseEntity {
  @Column({ type: 'enum', enum: RegistrationType })
  type: RegistrationType;

  @Column({ name: 'request_data', type: 'jsonb' })
  requestData: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING_APPROVAL,
  })
  status: RegistrationStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt?: Date;

  @Column({ name: 'rejection_reason', nullable: true })
  rejectionReason?: string;
}
