import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

/** Top-level tenant entity. All business data is scoped to one organization. */
@Entity('organizations')
@Unique(['name'])
export class OrganizationEntity extends BaseEntity {
  @Column({ comment: 'Legal or trading name of the business; globally unique' })
  name: string;

  @Column({ name: 'contact_email', comment: 'Primary contact email for the organization' })
  contactEmail: string;

  @Column({ name: 'contact_phone', nullable: true, comment: 'Optional phone number' })
  contactPhone?: string;

  @Column({ name: 'main_branch_id', type: 'uuid', nullable: true, comment: 'FK to branches — the default/headquarters branch' })
  mainBranchId?: string;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.ACTIVE,
    comment: 'Current lifecycle status; SUSPENDED blocks all access',
  })
  status: OrganizationStatus;
}
