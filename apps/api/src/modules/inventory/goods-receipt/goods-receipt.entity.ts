import {
  Entity,
  Column,
  Index,
  OneToMany,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
} from 'typeorm';
import {
  GoodsReceiptStatus,
  GoodsReceiptPurpose,
  GoodsReceiptReferenceType,
  DocCounterpartyKind,
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import { ProviderEntity } from '../location/provider.entity';
import { LocationEntity } from '../location/location.entity';
import { CounterpartyDisplay } from '../location/services/counterparty-name.util';

export enum GoodsReceiptPaymentMethod {
  CASH = 'CASH',
  CREDIT = 'CREDIT',
}

/** Phiếu nhập kho — goods receipt. State: DRAFT → POSTED → (REVERSED) | CANCELLED. */
@Entity('goods_receipts')
@Index(['organizationId', 'status'])
@Index('IDX_goods_receipts_org_branch_list', ['organizationId', 'branchId', 'status', 'receivedAt'])
export class GoodsReceiptEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, comment: 'Auto-generated on post (PNK-YY-####)' })
  documentNumber?: string;

  @Column({ type: 'enum', enum: GoodsReceiptStatus, default: GoodsReceiptStatus.DRAFT })
  status: GoodsReceiptStatus;

  @Column({ type: 'enum', enum: GoodsReceiptPurpose, default: GoodsReceiptPurpose.OTHER })
  purpose: GoodsReceiptPurpose;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId?: string;

  @Column({
    name: 'counterparty_kind',
    type: 'enum',
    enum: DocCounterpartyKind,
    enumName: 'doc_counterparty_kind_enum',
    nullable: true,
    comment: 'Đối tượng kind for v2 receipts: supplier (NCC) or customer (KH)',
  })
  counterpartyKind?: DocCounterpartyKind | null;

  @Column({
    name: 'counterparty_id',
    type: 'uuid',
    nullable: true,
    comment: 'Id of the provider or customer, per counterpartyKind',
  })
  counterpartyId?: string | null;

  @Column({ name: 'delivered_by', length: 200, nullable: true })
  deliveredBy?: string;

  @Column({ length: 500, nullable: true })
  reason?: string;

  @Column({ length: 2000, nullable: true })
  description?: string;

  @Column({ name: 'reference_id', type: 'uuid', nullable: true })
  referenceId?: string;

  @Column({
    name: 'reference_type',
    type: 'enum',
    enum: GoodsReceiptReferenceType,
    nullable: true,
  })
  referenceType?: GoodsReceiptReferenceType;

  /** Convenience: source branch for TRANSFER_IN — orthogonal to referenceId (which points to a stock-transfer doc). */
  @Column({ name: 'source_branch_id', nullable: true })
  sourceBranchId?: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'location_id', type: 'uuid' })
  locationId: string;

  @Column({ name: 'attachment_ids', type: 'jsonb', default: () => "'[]'::jsonb" })
  attachmentIds: string[];

  @Column({ name: 'references', type: 'jsonb', default: () => "'[]'::jsonb", comment: 'FE-supplied reference codes shown as Tham chiếu' })
  references: string[];

  @Column({
    name: 'payment_method',
    type: 'enum',
    enum: GoodsReceiptPaymentMethod,
    enumName: 'goods_receipt_payment_method_enum',
    nullable: true,
  })
  paymentMethod?: GoodsReceiptPaymentMethod;

  @Column({ name: 'cash_account_id', type: 'uuid', nullable: true })
  cashAccountId?: string;

  @Column({ name: 'journal_entry_id', type: 'uuid', nullable: true })
  journalEntryId?: string;

  @Column({ name: 'cash_payment_id', type: 'uuid', nullable: true })
  cashPaymentId?: string;

  @Column({ name: 'cash_receipt_id', type: 'uuid', nullable: true })
  cashReceiptId?: string;

  @Column({ name: 'posted_at', type: 'timestamptz', nullable: true })
  postedAt?: Date;

  @Column({ name: 'posted_by', type: 'uuid', nullable: true })
  postedBy?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;

  @OneToMany(() => GoodsReceiptLineEntity, (line) => line.goodsReceipt, {
    cascade: ['insert'],
    eager: true,
  })
  lines: GoodsReceiptLineEntity[];

  @ManyToOne(() => ProviderEntity, { eager: true, nullable: true })
  @JoinColumn({ name: 'provider_id' })
  provider?: ProviderEntity;

  @ManyToOne(() => LocationEntity, { eager: true })
  @JoinColumn({ name: 'location_id' })
  location?: LocationEntity;

  /**
   * Transient (not a column): the resolved "Đối tượng" { kind, id, code, name }
   * inlined by the v2 search handler / getById so the FE renders supplier,
   * customer and employee counterparties alike (provider_id is null for the
   * latter two).
   */
  counterparty?: CounterpartyDisplay | null;
}
