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
} from '@erp/shared-interfaces';
import { BaseEntity } from '../../../database/entities/base.entity';
import { GoodsReceiptLineEntity } from './goods-receipt-line.entity';
import { ProviderEntity } from '../location/provider.entity';
import { LocationEntity } from '../location/location.entity';

/** Phiếu nhập kho — goods receipt. State: DRAFT → POSTED → (REVERSED) | CANCELLED. */
@Entity('goods_receipts')
@Index(['organizationId', 'status'])
export class GoodsReceiptEntity extends BaseEntity {
  @Column({ name: 'document_number', nullable: true, comment: 'Auto-generated on post (PNK-YY-####)' })
  documentNumber?: string;

  @Column({ type: 'enum', enum: GoodsReceiptStatus, default: GoodsReceiptStatus.DRAFT })
  status: GoodsReceiptStatus;

  @Column({ type: 'enum', enum: GoodsReceiptPurpose, default: GoodsReceiptPurpose.OTHER })
  purpose: GoodsReceiptPurpose;

  @Column({ name: 'provider_id', type: 'uuid', nullable: true })
  providerId?: string;

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
}
