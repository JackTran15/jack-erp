export enum DomainEventType {
  SALE_POSTED = 'SALE_POSTED',
  INVOICE_CANCELLED = 'INVOICE_CANCELLED',
  STOCK_MOVEMENT_POSTED = 'STOCK_MOVEMENT_POSTED',
  STOCK_DEDUCTION_REQUESTED = 'STOCK_DEDUCTION_REQUESTED',
  JOURNAL_POSTED = 'JOURNAL_POSTED',
  JOURNAL_REVERSED = 'JOURNAL_REVERSED',
  JOURNAL_POST_SALE_REQUESTED = 'JOURNAL_POST_SALE_REQUESTED',
  LOYALTY_POINTS_AWARD_REQUESTED = 'LOYALTY_POINTS_AWARD_REQUESTED',
  CASH_MOVEMENT_FROM_PAYMENT_REQUESTED = 'CASH_MOVEMENT_FROM_PAYMENT_REQUESTED',
  DEPOSIT_MOVEMENT_FROM_PAYMENT_REQUESTED = 'DEPOSIT_MOVEMENT_FROM_PAYMENT_REQUESTED',
  CUSTOMER_MERGED = 'CUSTOMER_MERGED',
  SALESMAN_ASSIGNED = 'SALESMAN_ASSIGNED',
  SALESMAN_UNASSIGNED = 'SALESMAN_UNASSIGNED',
  SALES_MANAGER_ASSIGNED = 'SALES_MANAGER_ASSIGNED',
  SALES_MANAGER_UNASSIGNED = 'SALES_MANAGER_UNASSIGNED',
  TEMP_WAREHOUSE_TRANSFER_REQUESTED = 'TEMP_WAREHOUSE_TRANSFER_REQUESTED',
  GOODS_RECEIPT_POSTED = 'GOODS_RECEIPT_POSTED',
  CASH_VOUCHER_NEEDED = 'CASH_VOUCHER_NEEDED',
  CASH_VOUCHER_CREATED = 'CASH_VOUCHER_CREATED',
  RETURN_POSTED = 'RETURN_POSTED',
  STOCK_RETURN_IN_REQUESTED = 'STOCK_RETURN_IN_REQUESTED',
  LOYALTY_POINTS_REVERSE_REQUESTED = 'LOYALTY_POINTS_REVERSE_REQUESTED',
  CASH_REFUND_REQUESTED = 'CASH_REFUND_REQUESTED',
  JOURNAL_POST_RETURN_REQUESTED = 'JOURNAL_POST_RETURN_REQUESTED',
  DEBT_OVERDUE = 'DEBT_OVERDUE',
  TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED = 'TEMP_WAREHOUSE_INVOICE_FULFILL_REQUESTED',
  DEPOSIT_LOCKED_PERIOD_BLOCKED = 'DEPOSIT_LOCKED_PERIOD_BLOCKED',
}

/** Emitted when a credit invoice debt passes its due date and is marked overdue. */
export interface DebtOverduePayload {
  debtId: string;
  invoiceId: string;
  customerId: string;
  dueDate: string;
  remainingAmount: number;
}

export enum DeadLetterStatus {
  PENDING = 'PENDING',
  RESOLVED = 'RESOLVED',
  IGNORED = 'IGNORED',
}

export interface DomainEvent<T = unknown> {
  eventId: string;
  eventType: DomainEventType;
  timestamp: string;
  organizationId: string;
  branchId?: string;
  correlationId: string;
  payload: T;
}

export type CashVoucherSourceType =
  | 'POS_SALE'
  | 'DEBT_PAYMENT'
  | 'GOODS_RECEIPT'
  | 'EXPENSE';

export type CashVoucherPartnerKind =
  | 'CUSTOMER'
  | 'SUPPLIER'
  | 'EMPLOYEE'
  | 'OTHER';

/**
 * POS cash sale payload (kept as-is): the consumer creates the cash movement +
 * journal entry + Phiếu thu atomically.
 */
export interface CashMovementFromPaymentPayload {
  invoiceId: string;
  invoicePaymentId?: string;
  invoiceCode: string;
  sessionId?: string;
  cashAccountId: string;
  contraAccountId: string; // revenue account
  amount: number;
  branchId?: string;
  organizationId: string;
  actorId: string;
}

/**
 * Phase 2 A-revised flows (debt / goods-receipt / expense): the source service has
 * already committed the movement + JE; the voucher consumer only creates the
 * Phiếu thu/chi document linking the existing movement + JE.
 */
export interface CashVoucherNeededPayload {
  sourceType: 'DEBT_PAYMENT' | 'GOODS_RECEIPT' | 'EXPENSE';
  sourceId: string;
  sourceDocumentNumber?: string;
  amount: number;
  cashAccountId: string;
  contraAccountId: string;
  cashMovementId: string;
  journalEntryId: string;
  partnerType?: CashVoucherPartnerKind;
  partnerId?: string;
  partnerName?: string;
  description?: string;
  categoryCode?: string;
  organizationId: string;
  branchId: string;
  actorId: string;
}

/** Emitted by the voucher consumer after a voucher document is created. */
export interface CashVoucherCreatedPayload {
  sourceType: CashVoucherSourceType;
  sourceId: string;
  voucherKind: 'CASH_RECEIPT' | 'CASH_PAYMENT';
  voucherId: string;
  voucherNumber: string;
  // Journal entry shared with the source/movement (the voucher only links it).
  journalEntryId: string;
  cashMovementId: string;
  organizationId: string;
  branchId?: string;
}
