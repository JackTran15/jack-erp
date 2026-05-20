import { Entity, Column, Index, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

/** Job position / title an employee can hold (e.g. Cashier, Store Manager). Reference data, org-scoped. */
@Entity('job_positions')
@Index('uq_job_position_org_name', ['organizationId', 'name'], { unique: true })
export class JobPositionEntity extends BaseEntity {
  @Column({ length: 255, comment: 'Human-readable position name; unique per organization' })
  name: string;

  @Column({ length: 50, nullable: true, comment: 'Optional short code' })
  code?: string;

  @Column({ length: 500, nullable: true, comment: 'Optional description' })
  description?: string;

  @Column({ name: 'is_active', default: true, comment: 'Inactive positions are hidden from assignment dropdowns' })
  isActive: boolean;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true, comment: 'Soft-delete timestamp' })
  deletedAt?: Date;
}
