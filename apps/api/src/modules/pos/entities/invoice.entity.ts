import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseEntity } from '../../../database/entities/base.entity';

export enum InvoiceStatus {
  DRAFT        = 'draft',
  PENDING      = 'pending',
  PAID         = 'paid',
  DEBT         = 'debt',
  PARTIAL_DEBT = 'partial_debt',
  CANCELLED    = 'cancelled',
}

export enum InvoicePaymentMethod {
  CASH          = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD          = 'card',
}

export enum InvoiceType {
  SALE     = 'SALE',
  RETURN   = 'RETURN',
  EXCHANGE = 'EXCHANGE',
}

export enum RefundMethod {
  CASH         = 'CASH',
  STORE_CREDIT = 'STORE_CREDIT',
  OFFSET       = 'OFFSET',
}

/** POS invoice — supports SALE, RETURN, EXCHANGE via the `type` column. */
@Entity('invoices')
@Index(['organizationId', 'branchId', 'issuedAt'])
@Index(['organizationId', 'customerId'])
@Index(['organizationId', 'sessionId', 'isDraft'])
@Index('uq_invoice_org_code', ['organizationId', 'code'], { unique: true })
@Index('IDX_invoices_org_original', ['organizationId', 'originalInvoiceId'])
@Index('IDX_invoices_org_branch_status_created', ['organizationId', 'branchId', 'status', 'createdAt'])
@Index('IDX_invoices_org_customer_type_status', ['organizationId', 'customerId', 'type', 'status'])
export class InvoiceEntity extends BaseEntity {
  @Column({ length: 20, comment: 'Auto-generated invoice code, unique per organisation' })
  code: string;

  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true, comment: 'Timestamp the invoice was issued; null while in draft state' })
  issuedAt?: Date;

  @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.DRAFT, comment: 'Current lifecycle status of the invoice' })
  status: InvoiceStatus;

  @Column({ type: 'enum', enum: InvoiceType, default: InvoiceType.SALE, comment: 'Invoice variant: SALE (outflow), RETURN (refund), EXCHANGE (swap)' })
  type: InvoiceType;

  @Column({ name: 'original_invoice_id', type: 'uuid', nullable: true, comment: 'For RETURN/EXCHANGE: link to the original SALE invoice (null for quick-return)' })
  originalInvoiceId?: string;

  @ManyToOne(() => InvoiceEntity, { nullable: true })
  @JoinColumn({ name: 'original_invoice_id' })
  originalInvoice?: InvoiceEntity;

  @Column({ name: 'refund_method', type: 'enum', enum: RefundMethod, nullable: true, comment: 'How refund was settled: CASH / STORE_CREDIT / OFFSET (RETURN + EXCHANGE only)' })
  refundMethod?: RefundMethod;

  @Column({ name: 'refunded_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Amount refunded to customer (max(returnSubtotal - newSubtotal, 0))' })
  refundedAmount: number;

  @Column({ name: 'net_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'EXCHANGE net = newSubtotal - returnSubtotal (positive = customer pays more)' })
  netAmount: number;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Sum of all line totals before discount' })
  subtotal: number;

  @Column({ name: 'discount_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Total discount applied to the invoice' })
  discountAmount: number;

  @Column({ name: 'points_redeemed', type: 'int', default: 0, comment: 'Loyalty points redeemed against this invoice' })
  pointsRedeemed: number;

  @Column({ name: 'points_discount_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Discount granted by loyalty point redemption (pointsRedeemed * POINT_REDEMPTION_VALUE_VND)' })
  pointsDiscountAmount: number;

  @Column({ name: 'deposit_amount', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Deposit collected upfront (e.g. on layaway)' })
  depositAmount: number;

  @Column({ name: 'amount_due', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Final amount the customer owes (subtotal - discountAmount - pointsDiscountAmount - depositAmount)' })
  amountDue: number;

  @Column({ name: 'total_paid', type: 'numeric', precision: 18, scale: 2, default: 0, comment: 'Total amount collected across all payment lines' })
  totalPaid: number;

  @Column({ type: 'text', nullable: true, comment: 'Free-text note attached to the invoice' })
  note?: string;

  @Column({ name: 'is_draft', default: true, comment: 'True while the invoice has not been finalised / committed' })
  isDraft: boolean;

  @Column({ name: 'session_id', comment: 'POS session that originated this invoice' })
  sessionId: string;

  @Column({ name: 'draft_label', nullable: true, comment: 'User-visible label for in-progress draft (e.g. "Table 3")' })
  draftLabel?: string;

  @Column({ name: 'customer_id', type: 'uuid', nullable: true, comment: 'Customer linked to this invoice; null for anonymous sales' })
  customerId?: string;

  @Column({ name: 'staff_id', type: 'uuid', comment: 'Staff member who created / owns the invoice' })
  staffId: string;

  @Column({ name: 'price_list_id', type: 'uuid', nullable: true, comment: 'Price list applied at invoice creation (future feature)' })
  priceListId?: string;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt?: Date;

  @Column({ name: 'cancel_reason', type: 'text', nullable: true })
  cancelReason?: string;
}
