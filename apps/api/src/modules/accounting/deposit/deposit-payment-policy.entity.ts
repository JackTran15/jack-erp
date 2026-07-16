import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';
import { FeeBearer } from '@erp/shared-interfaces';

/**
 * Thin deposit-side economics for a payment method. It does NOT re-map
 * payment_method → account — payment_accounts already owns that, and the deposit
 * fund is derived by joining the resolved COA (invoice_payments.account_id) to
 * deposit_accounts.account_id. This table only adds fee / settlement / effective
 * dating and an optional fund override for the ambiguous 1-COA↔many-funds case.
 * Scope mirrors payment_accounts: org-wide when branch_id is NULL, branch override otherwise.
 */
@Entity('deposit_payment_policy')
@Index('idx_deposit_payment_policy_lookup', ['organizationId', 'branchId', 'paymentMethod'])
export class DepositPaymentPolicyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar', nullable: true })
  branchId?: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 50 })
  paymentMethod: string;

  @Column({ name: 'card_type', type: 'varchar', length: 50, nullable: true })
  cardType?: string | null;

  /** Fund override; only used when the COA-join is ambiguous (one COA, many funds). */
  @Column({ name: 'deposit_account_id', type: 'uuid', nullable: true })
  depositAccountId?: string | null;

  @Column({ name: 'fee_rate', type: 'numeric', precision: 9, scale: 4, default: 0 })
  feeRate: number;

  @Column({ name: 'fee_bearer', type: 'enum', enum: FeeBearer, nullable: true })
  feeBearer?: FeeBearer | null;

  @Column({ name: 'settlement_days', type: 'int', default: 0 })
  settlementDays: number;

  @Column({ name: 'effective_from', type: 'date', default: () => 'CURRENT_DATE' })
  effectiveFrom: string;

  @Column({ name: 'effective_to', type: 'date', nullable: true })
  effectiveTo?: string | null;

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
