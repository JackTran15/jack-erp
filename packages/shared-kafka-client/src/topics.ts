export const ERP_TOPICS = {
  SALE_POSTED: 'erp.sale.posted',
  INVOICE_CANCELLED: 'erp.invoice.cancelled',
  STOCK_MOVEMENT_POSTED: 'erp.stock.movement.posted',
  JOURNAL_POSTED: 'erp.journal.posted',
  CUSTOMER_MERGED: 'erp.customer.merged',
} as const;

export type ErpTopic = (typeof ERP_TOPICS)[keyof typeof ERP_TOPICS];

export function buildTopicName(domain: string, action: string): string {
  return `erp.${domain}.${action}`;
}
