import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashVoucherPartnerType, DebtCollectionSagaStatus } from '../enums';

/** One settled invoice debt within a debt-collection saga. */
export interface DebtCollectionAllocation {
  invoiceDebtId: string;
  amount: number;
  /** Set once the instalment row is created in the COMPLETED step. */
  debtPaymentId?: string;
  settled: boolean;
}

/**
 * State of a single "thu hồi nợ" (debt-collection) saga. The whole flow runs in
 * one ACID transaction; this row records the steps so the operation can be
 * observed and compensated (reversed). Idempotent per (organization, key).
 */
@Entity('cash_debt_collection_saga')
@Index('IDX_debt_collection_saga_org_status', ['organizationId', 'status'])
@Index('IDX_debt_collection_saga_receipt', ['cashReceiptId'])
@Index('UQ_debt_collection_saga_idem', ['organizationId', 'idempotencyKey'], {
  unique: true,
})
export class DebtCollectionSagaEntity extends BaseEntity {
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

  @Column({ name: 'cash_receipt_id', type: 'uuid', nullable: true })
  cashReceiptId?: string;

  @Column({ name: 'cash_account_id', type: 'uuid' })
  cashAccountId: string;

  @Column({ name: 'contra_account_id', type: 'uuid' })
  contraAccountId: string;

  /** Denormalized copy for observability — stored as text, not a pg enum. */
  @Column({ name: 'partner_type', type: 'varchar', length: 32, nullable: true })
  partnerType?: CashVoucherPartnerType;

  @Column({ name: 'partner_id', type: 'uuid', nullable: true })
  partnerId?: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 18, scale: 2 })
  totalAmount: number;

  @Column({ type: 'jsonb' })
  allocations: DebtCollectionAllocation[];

  @Column({ type: 'text', nullable: true })
  error?: string;
}
