import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * Bank catalogue (danh mục ngân hàng), org-scoped. Referenced by deposit_accounts.
 * Columns are declared explicitly (not via BaseEntity) so the table has no branch_id.
 */
@Entity('banks')
@Index('IDX_banks_org', ['organizationId'])
export class BankEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ name: 'short_name', type: 'varchar', length: 100, nullable: true })
  shortName?: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
