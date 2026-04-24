import { Entity, Column } from 'typeorm';
import { RegistrationStatus } from '@erp/shared-interfaces';
import { BaseEntity } from '../../database/entities/base.entity';

export enum RegistrationType {
  ORGANIZATION = 'ORGANIZATION',
  BRANCH = 'BRANCH',
}

/** Self-service registration workflow for new organizations or branches. */
@Entity('registration_requests')
export class RegistrationRequestEntity extends BaseEntity {
  @Column({ type: 'enum', enum: RegistrationType, comment: 'Whether this is an organization or branch registration' })
  type: RegistrationType;

  @Column({ name: 'request_data', type: 'jsonb', comment: 'Freeform JSON containing submitted registration details (org name, owner email, etc.)' })
  requestData: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: RegistrationStatus,
    default: RegistrationStatus.PENDING_APPROVAL,
    comment: 'Current state in the approval workflow',
  })
  status: RegistrationStatus;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true, comment: 'Admin who approved or rejected the request' })
  reviewedBy?: string;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true, comment: 'When the review decision was made' })
  reviewedAt?: Date;

  @Column({ name: 'rejection_reason', nullable: true, comment: 'Explanation provided when the request is rejected' })
  rejectionReason?: string;
}
