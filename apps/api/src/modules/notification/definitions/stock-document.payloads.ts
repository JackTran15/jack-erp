/**
 * Payloads of the two document-level stock events, and the mobile route slugs
 * they open. The slugs are the stock document kinds of the mobile app
 * (`/stock/<slug>/detail/<id>` — jack-erp-mobile `StockDocumentConstant`).
 */

/** `erp.inventory.goods_receipt.posted` (`GoodsReceiptService.post`). */
export interface GoodsReceiptPostedPayload {
  receiptId: string;
  documentNumber: string;
  /** PURCHASE = "nhập hàng mua"; anything else (OTHER, TRANSFER_IN, STOCK_TAKE) = "nhập kho". */
  purpose: string;
  providerId?: string;
  totalAmount: number;
  lineCount: number;
  postedAt: string;
  postedBy: string;
}

export const GOODS_RECEIPT_PURCHASE = 'PURCHASE';

export const STOCK_DOCUMENT_SLUG = {
  goodsReceipt: 'goods-receipt',
  stockIn: 'stock-in',
  stockOut: 'stock-out',
} as const;
