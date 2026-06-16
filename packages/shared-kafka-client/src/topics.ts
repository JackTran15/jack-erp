export const ERP_TOPICS = {
  SALE_POSTED: 'erp.sale.posted',
  INVOICE_CANCELLED: 'erp.invoice.cancelled',
  STOCK_MOVEMENT_POSTED: 'erp.stock.movement.posted',
  STOCK_DEDUCTION: 'erp.stock.deduction',
  JOURNAL_POSTED: 'erp.journal.posted',
  JOURNAL_REVERSED: 'erp.journal.reversed',
  JOURNAL_POST_SALE: 'erp.journal.post.sale',
  LOYALTY_POINTS_AWARD: 'erp.loyalty.points.award',
  /**
   * POS cash sale → consumer creates movement + JE + Phiếu thu (atomic).
   * @deprecated Use CASH_VOUCHER_NEEDED_POS_SALE — same topic string, kept for
   * backward compatibility.
   */
  CASH_MOVEMENT_FROM_PAYMENT: 'erp.cash.movement.from.payment',
  // Cash voucher auto-create flows (Phase 2).
  CASH_VOUCHER_NEEDED_POS_SALE: 'erp.cash.movement.from.payment',
  CASH_VOUCHER_NEEDED_DEBT_PAYMENT: 'erp.cash.voucher.needed.debt_payment',
  CASH_VOUCHER_NEEDED_GOODS_RECEIPT: 'erp.cash.voucher.needed.goods_receipt',
  CASH_VOUCHER_NEEDED_EXPENSE: 'erp.cash.voucher.needed.expense',
  CASH_VOUCHER_CREATED: 'erp.cash.voucher.created',
  CUSTOMER_MERGED: 'erp.customer.merged',
  TEMP_WAREHOUSE_TRANSFER_REQUESTED: 'erp.temp-warehouse.transfer-requested',
  RETURN_POSTED: 'erp.return.posted',
  STOCK_RETURN_IN: 'erp.stock.return.in',
  LOYALTY_POINTS_REVERSE: 'erp.loyalty.points.reverse',
  CASH_REFUND: 'erp.cash.refund',
  JOURNAL_POST_RETURN: 'erp.journal.post.return',
  GOODS_RECEIPT_POSTED: 'erp.inventory.goods_receipt.posted',
  DEBT_OVERDUE: 'erp.debt.overdue',
} as const;

export type ErpTopic = (typeof ERP_TOPICS)[keyof typeof ERP_TOPICS];

export function buildTopicName(domain: string, action: string): string {
  return `erp.${domain}.${action}`;
}
