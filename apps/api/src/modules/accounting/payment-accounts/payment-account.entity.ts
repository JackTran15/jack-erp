import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { PaymentAccountMethod } from './enums';

/**
 * Maps a POS payment method (cash/bank_transfer/card) to a single COA account
 * (the receiving account), scoped to org + branch. Bank columns are structured
 * so the UI can compose a label like "<accountNumber> - <bankCode> - <bankName>";
 * they are null for cash.
 *
 * Columns are declared explicitly instead of extending {@link BaseEntity}: this
 * table's `branch_id` is NOT NULL (always branch-scoped), and TypeORM 0.3.28
 * cannot override an inherited column's `nullable` flag (a child @Column may only
 * override `default`), which would leave entity metadata diverging from the DB.
 */
@Entity('payment_accounts')
@Index('IDX_payment_accounts_org_branch', ['organizationId', 'branchId'])
@Index('IDX_payment_accounts_account', ['accountId'])
export class PaymentAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  /** Always branch-scoped — NOT NULL, unlike BaseEntity's nullable branch_id. */
  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: PaymentAccountMethod,
    enumName: 'payment_account_method_enum',
  })
  paymentMethod: PaymentAccountMethod;

  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 200, nullable: true })
  bankName?: string;

  @Column({ name: 'bank_code', type: 'varchar', length: 50, nullable: true })
  bankCode?: string;

  @Column({ name: 'account_number', type: 'varchar', length: 50, nullable: true })
  accountNumber?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
