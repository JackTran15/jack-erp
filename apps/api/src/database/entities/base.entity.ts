import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

/** Abstract base for all multi-tenant, auditable entities. */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant isolation key — every row belongs to exactly one organization. */
  @Column({ name: 'organization_id', comment: 'Tenant isolation key — every row belongs to exactly one organization' })
  organizationId: string;

  /** Optional branch scope; null for org-wide records. */
  @Column({ name: 'branch_id', nullable: true, comment: 'Optional branch scope; null for org-wide records' })
  branchId?: string;

  @CreateDateColumn({ name: 'created_at', comment: 'Row creation timestamp (auto-set)' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', comment: 'Last modification timestamp (auto-set)' })
  updatedAt: Date;

  /** UUID of the user who created this record. */
  @Column({ name: 'created_by', comment: 'UUID of the user who created this record' })
  createdBy: string;
}
