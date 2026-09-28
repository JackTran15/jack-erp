/**
 * Map hóa đơn mock sang hình dạng mà `InvoiceDetailDialog` (treasury) render —
 * tái dùng modal "Chi tiết hóa đơn" có sẵn thay vì dựng modal mới.
 */
import {
  LedgerCashInvoiceKindEnum,
  type LedgerCashInvoiceDetail,
} from "../../../treasury/ledger-cash/ledger-cash.types";
import type { EInvoiceRecord } from "./einvoice.interface";

export function toInvoiceDetail(record: EInvoiceRecord): LedgerCashInvoiceDetail {
  const goodsAmount = record.lines.reduce((acc, l) => acc + l.goodsAmount, 0);
  return {
    // Hóa đơn trả hàng có hậu tố "TH" (vd 2609060005TH).
    kind: record.invoiceCode.endsWith("TH")
      ? LedgerCashInvoiceKindEnum.RETURN
      : LedgerCashInvoiceKindEnum.PAYMENT,
    code: record.invoiceCode,
    cashier: "",
    customer: record.buyer.unitName || record.buyer.buyerName,
    issuedAt: new Date(`${record.invoiceDate}T00:00:00`),
    phone: record.buyer.phone || undefined,
    salesChannel: "Bán tại cửa hàng",
    lines: record.lines.map((l) => ({
      sku: l.sku,
      name: l.name,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineAmount: l.goodsAmount,
      discountAmount: l.goodsAmount - l.amount,
      totalAmount: l.amount,
    })),
    totalPayment: record.total,
    goodsAmount,
    cashAmount: record.total,
  };
}
