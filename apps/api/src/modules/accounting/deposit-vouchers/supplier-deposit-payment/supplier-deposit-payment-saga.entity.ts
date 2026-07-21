import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { BankVoucherPartnerType } from '../enums';
import { DebtCollectionSagaStatus } from '../../cash-vouchers/enums';

/** One settled supplier debt within a supplier-deposit-payment saga. */
export interface SupplierDepositPaymentAllocation {
  supplierDebtId: string;
  amount: number;
  /** Set once the instalment row is created in the COMPLETED step. */
  supplierDebtPaymentId?: string;
  settled: boolean;
}

/**
 * State of a single "trả NCC bằng tiền gửi / hỗn hợp" (TKT-DFS-05) saga — the
 * deposit-fund mirror of SupplierDebtPaymentSagaEntity. Funds one or two legs
 * (`bank_payment_id` and/or `cash_payment_id` for the BR-BUY-03 mixed case) and
 * settles every allocated supplier debt in one ACID transaction. Idempotent per
 * (organization, key). Reuses the generic debt_collection_saga_status_enum.
 */
@Entity('deposit_supplier_payment_saga')
@Index('IDX_deposit_supplier_payment_saga_org_status', ['organizationId', 'status'])
@Index('IDX_deposit_supplier_payment_saga_bank_payment', ['bankPaymentId'])
@Index('IDX_deposit_supplier_payment_saga_cash_payment', ['cashPaymentId'])
@Index('UQ_deposit_supplier_payment_saga_idem', ['organizationId', 'idempotencyKey'], {
  unique: true,
})
export class SupplierDepositPaymentSagaEntity extends BaseEntity {
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

  @Column({ name: 'bank_payment_id', type: 'uuid', nullable: true })
  bankPaymentId?: string;

  @Column({ name: 'cash_payment_id', type: 'uuid', nullable: true })
  cashPaymentId?: string;

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
  allocations: SupplierDepositPaymentAllocation[];

  @Column({ type: 'text', nullable: true })
  error?: string;
}
