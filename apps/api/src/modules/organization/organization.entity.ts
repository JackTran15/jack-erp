import { Entity, Column, Unique } from 'typeorm';
import { BaseEntity } from '../../database/entities/base.entity';

export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
}

@Entity('organizations')
@Unique(['name'])
export class OrganizationEntity extends BaseEntity {
  @Column()
  name: string;

  @Column({ name: 'contact_email' })
  contactEmail: string;

  @Column({ name: 'contact_phone', nullable: true })
  contactPhone?: string;

  @Column({ name: 'main_branch_id', type: 'uuid', nullable: true })
  mainBranchId?: string;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.ACTIVE,
  })
  status: OrganizationStatus;
}
