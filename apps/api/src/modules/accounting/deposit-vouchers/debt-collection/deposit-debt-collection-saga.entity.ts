import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { DebtCollectionSagaStatus } from '../../cash-vouchers/enums';
import { BankVoucherPartnerType } from '../enums';

/** One settled invoice debt within a deposit debt-collection saga. */
export interface DepositDebtCollectionAllocation {
  invoiceDebtId: string;
  amount: number;
  /** Set once the instalment row is created in the COMPLETED step. */
  debtPaymentId?: string;
  settled: boolean;
}

/**
 * State of a single "thu hồi nợ vào tài khoản tiền gửi" saga — the deposit-fund
 * twin of {@link DebtCollectionSagaEntity}. The whole flow runs in one ACID
 * transaction; this row records the steps so the operation can be observed and
 * compensated (reversed). Idempotent per (organization, key).
 */
@Entity('deposit_debt_collection_saga')
@Index('IDX_dep_debt_collection_saga_org_status', ['organizationId', 'status'])
@Index('IDX_dep_debt_collection_saga_receipt', ['bankReceiptId'])
@Index('UQ_dep_debt_collection_saga_idem', ['organizationId', 'idempotencyKey'], {
  unique: true,
})
export class DepositDebtCollectionSagaEntity extends BaseEntity {
  /** Client idempotency key (X-Idempotency-Key) — dedupes retries per org. */
  @Column({ name: 'idempotency_key', type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: DebtCollectionSagaStatus,
    enumName: 'debt_collection_saga_status_enum',
    default: DebtCollectionSagaStatus.PENDING,
  })
  status: DebtCollectionSagaStatus;

  @Column({ name: 'bank_receipt_id', type: 'uuid', nullable: true })
  bankReceiptId?: string;

  @Column({ name: 'deposit_account_id', type: 'uuid' })
  depositAccountId: string;

  @Column({ name: 'contra_account_id', type: 'uuid' })
  contraAccountId: string;

  /** Denormalized copy for observability — stored as text, not a pg enum. */
  @Column({ name: 'partner_type', type: 'varchar', length: 32, nullable: true })
  partnerType?: BankVoucherPartnerType;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId?: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ type: 'jsonb' })
  allocations: DepositDebtCollectionAllocation[];

  @Column({ type: 'text', nullable: true })
  error?: string;
}
