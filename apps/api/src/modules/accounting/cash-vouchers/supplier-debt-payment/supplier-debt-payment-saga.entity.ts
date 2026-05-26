import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../database/entities/base.entity';
import { CashVoucherPartnerType, DebtCollectionSagaStatus } from '../enums';

/** One settled supplier debt within a supplier-debt-payment saga. */
export interface SupplierDebtPaymentAllocation {
  supplierDebtId: string;
  amount: number;
  /** Set once the instalment row is created in the COMPLETED step. */
  supplierDebtPaymentId?: string;
  settled: boolean;
}

/**
 * State of a single "trả nợ NCC" (supplier-debt payment) saga — the
 * accounts-payable mirror of the debt-collection saga. The whole flow runs in
 * one ACID transaction; this row records the steps for observability and
 * compensation. Idempotent per (organization, key). Reuses the generic
 * debt_collection_saga_status_enum.
 */
@Entity('cash_supplier_debt_payment_saga')
@Index('IDX_supplier_debt_payment_saga_org_status', ['organizationId', 'status'])
@Index('IDX_supplier_debt_payment_saga_payment', ['cashPaymentId'])
@Index('UQ_supplier_debt_payment_saga_idem', ['organizationId', 'idempotencyKey'], {
  unique: true,
})
export class SupplierDebtPaymentSagaEntity extends BaseEntity {
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

  @Column({ name: 'cash_payment_id', type: 'uuid', nullable: true })
  cashPaymentId?: string;

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
  allocations: SupplierDebtPaymentAllocation[];

  @Column({ type: 'text', nullable: true })
  error?: string;
}
