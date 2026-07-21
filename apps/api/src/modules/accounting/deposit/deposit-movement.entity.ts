import {
  Entity,
  Column,
  Index,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import {
  DepositMovementType,
  DepositMovementSource,
  ReconStatus,
  DepositTransferStatus,
} from '@erp/shared-interfaces';
import { DepositAccountEntity } from './deposit-account.entity';

/**
 * Append-only ledger row for a deposit account (mirrors cash_movements) plus
 * reconciliation (recon_status / recon_batch), fee (fee_amount / net_amount) and
 * settlement (value_date) columns. No soft delete — corrections are reversal rows.
 *
 * (source, source_ref_id, source_ref_line_id) is UNIQUE at payment-line grain to block
 * POS double-post at the DB layer (D2 / BR-POS-01).
 */
@Entity('deposit_movements')
@Index('idx_deposit_movements_account', ['depositAccountId'])
@Index('idx_deposit_movements_org_branch', ['organizationId', 'branchId'])
// Payment-line idempotency guard (D2 / BR-POS-01). Also declared in the migration; kept
// on the entity so synchronize-based schemas (e.g. the e2e harness) get the DB guard too.
@Index('uniq_deposit_movements_source_ref', ['source', 'sourceRefId', 'sourceRefLineId'], {
  unique: true,
})
export class DepositMovementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'varchar' })
  organizationId: string;

  @Column({ name: 'branch_id', type: 'varchar' })
  branchId: string;

  @Column({ name: 'deposit_account_id', type: 'uuid' })
  depositAccountId: string;

  @ManyToOne(() => DepositAccountEntity)
  @JoinColumn({ name: 'deposit_account_id' })
  depositAccount?: DepositAccountEntity;

  @Column({ name: 'to_account_id', type: 'uuid', nullable: true })
  toAccountId?: string | null;

  @ManyToOne(() => DepositAccountEntity, { nullable: true })
  @JoinColumn({ name: 'to_account_id' })
  toAccount?: DepositAccountEntity;

  @Column({ type: 'enum', enum: DepositMovementType })
  type: DepositMovementType;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  amount: number;

  @Column({ name: 'fee_amount', type: 'numeric', precision: 18, scale: 2, default: 0 })
  feeAmount: number;

  @Column({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2 })
  netAmount: number;

  @Column({ name: 'doc_date', type: 'date' })
  docDate: string;

  @Column({ name: 'value_date', type: 'date', nullable: true })
  valueDate?: string | null;

  @Column({
    name: 'recon_status',
    type: 'enum',
    enum: ReconStatus,
    default: ReconStatus.CHUA,
  })
  reconStatus: ReconStatus;

  @Column({ name: 'recon_batch_id', type: 'uuid', nullable: true })
  reconBatchId?: string | null;

  @Column({ name: 'reconciled_by', type: 'varchar', nullable: true })
  reconciledBy?: string | null;

  @Column({ name: 'reconciled_at', type: 'timestamptz', nullable: true })
  reconciledAt?: Date | null;

  @Column({ type: 'enum', enum: DepositMovementSource })
  source: DepositMovementSource;

  @Column({ name: 'source_ref_id', type: 'uuid', nullable: true })
  sourceRefId?: string | null;

  // varchar, not uuid: also holds non-UUID markers ('FEE', '<lineId>-REVERSAL')
  // from GĐ3 fee posting / cancellation reversal, alongside the normal
  // invoice_payments.id value (TKT-DFR-09 fix — see the 1786800000000 migration).
  @Column({ name: 'source_ref_line_id', type: 'varchar', nullable: true })
  sourceRefLineId?: string | null;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId?: string | null;

  @Column({ name: 'transfer_pair_id', type: 'uuid', nullable: true })
  transferPairId?: string | null;

  @Column({
    name: 'transfer_status',
    type: 'enum',
    enum: DepositTransferStatus,
    nullable: true,
  })
  transferStatus?: DepositTransferStatus | null;

  @Column({ name: 'document_number', type: 'varchar', length: 64, nullable: true })
  documentNumber?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ name: 'created_by', type: 'varchar' })
  createdBy: string;
}
