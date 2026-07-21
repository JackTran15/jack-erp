import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { DepositAccountType, DepositAccountStatus } from '@erp/shared-interfaces';
import { BankEntity } from './bank.entity';

/**
 * A branch's deposit fund account (bank account / e-wallet / POS merchant), mirroring
 * cash_accounts with a real-time balance. branch_id is NOT NULL (one account = one
 * branch); columns are declared explicitly because BaseEntity's branch_id is nullable.
 */
@Entity('deposit_accounts')
@Index('IDX_deposit_accounts_org_branch', ['organizationId', 'branchId'])
export class DepositAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ name: 'account_no', type: 'varchar', length: 50 })
  accountNo: string;

  @Column({ name: 'account_name', type: 'varchar', length: 200 })
  accountName: string;

  @Column({ name: 'bank_id', type: 'uuid' })
  bankId: string;

  @ManyToOne(() => BankEntity)
  @JoinColumn({ name: 'bank_id' })
  bank?: BankEntity;

  @Column({ name: 'bank_branch', type: 'varchar', length: 200, nullable: true })
  bankBranch?: string | null;

  @Column({ type: 'enum', enum: DepositAccountType })
  type: DepositAccountType;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mid?: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  tid?: string | null;

  /** Corresponding COA (112x) account in the chart of accounts. */
  @Column({ name: 'account_id', type: 'uuid' })
  accountId: string;

  @Column({ name: 'opening_balance', type: 'numeric', precision: 18, scale: 2, default: 0 })
  openingBalance: number;

  @Column({ name: 'opening_date', type: 'date' })
  openingDate: string;

  /** Current balance; updated in real-time with each movement. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  balance: number;

  @Column({ name: 'allow_negative', type: 'boolean', default: false })
  allowNegative: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'enum', enum: DepositAccountStatus, default: DepositAccountStatus.ACTIVE })
  status: DepositAccountStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
