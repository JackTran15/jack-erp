export const ERP_TOPICS = {
  SALE_POSTED: 'erp.sale.posted',
  INVOICE_CANCELLED: 'erp.invoice.cancelled',
  STOCK_MOVEMENT_POSTED: 'erp.stock.movement.posted',
  STOCK_DEDUCTION: 'erp.stock.deduction',
  JOURNAL_POSTED: 'erp.journal.posted',
  JOURNAL_REVERSED: 'erp.journal.reversed',
  JOURNAL_POST_SALE: 'erp.journal.post.sale',
  LOYALTY_POINTS_AWARD: 'erp.loyalty.points.award',
  CASH_MOVEMENT_FROM_PAYMENT: 'erp.cash.movement.from.payment',
  CUSTOMER_MERGED: 'erp.customer.merged',
  TEMP_WAREHOUSE_TRANSFER_REQUESTED: 'erp.temp-warehouse.transfer-requested',
  RETURN_POSTED: 'erp.return.posted',
  STOCK_RETURN_IN: 'erp.stock.return.in',
  LOYALTY_POINTS_REVERSE: 'erp.loyalty.points.reverse',
  CASH_REFUND: 'erp.cash.refund',
  JOURNAL_POST_RETURN: 'erp.journal.post.return',
  
} as const;

export type ErpTopic = (typeof ERP_TOPICS)[keyof typeof ERP_TOPICS];

export function buildTopicName(domain: string, action: string): string {
  return `erp.${domain}.${action}`;
}
