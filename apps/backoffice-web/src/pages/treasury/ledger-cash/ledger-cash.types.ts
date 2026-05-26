import type { CashPaymentPurpose, CashVoucherPartnerType } from "../cash-vouchers.types";
import type { PartnerLookupType } from "../documents/_shared/voucher-partner.constants";

export enum LedgerCashDocumentTypeEnum {
  OPENING_BALANCE = "opening_balance",
  INVOICE_SALE = "invoice_sale",
  INVOICE_RETURN = "invoice_return",
  CASH_RECEIPT = "cash_receipt",
  CASH_PAYMENT = "cash_payment",
  GOODS_RECEIPT_PAYMENT = "goods_receipt_payment",
}

export enum LedgerCashInvoiceKindEnum {
  PAYMENT = "payment",
  RETURN = "return",
}

export enum LedgerCashVoucherKindEnum {
  RECEIPT = "receipt",
  PAYMENT = "payment",
}

export enum LedgerCashVoucherPurposeEnum {
  OTHER = "other",
  DEBT_COLLECTION = "debt_collection",
  DEBT_REPAYMENT = "debt_repayment",
}

export enum LedgerCashVoucherPaymentModeEnum {
  SUPPLIER_DEBT = "supplier_debt",
  PAY_NOW = "pay_now",
}

export enum LedgerCashVoucherSheetTabEnum {
  GOODS_RECEIPT = "goods_receipt",
  PAYMENT = "payment",
}

export enum LedgerCashDetailTypeEnum {
  INVOICE = "invoice",
  VOUCHER = "voucher",
}

export enum LedgerCashDrillDownEnum {
  INVOICE = "invoice",
  VOUCHER = "voucher",
}

export interface LedgerCashInvoiceLine {
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  discountAmount: number;
  totalAmount: number;
  note?: string;
}

export interface LedgerCashInvoiceDetail {
  kind: LedgerCashInvoiceKindEnum;
  code: string;
  cashier: string;
  customer: string;
  issuedAt: Date;
  phone?: string;
  salesChannel: string;
  originalInvoiceCode?: string;
  lines: LedgerCashInvoiceLine[];
  totalPayment: number;
  goodsAmount: number;
  customerPaid?: number;
  refundToCustomer?: number;
  changeAmount?: number;
  cashAmount: number;
  returnValue?: number;
}

export interface LedgerCashVoucherLine {
  description: string;
  amount: number;
  category: string;
  categoryId?: string;
}

export interface LedgerCashVoucherDocumentLine {
  documentDate: Date;
  documentNo: string;
  debtAmount: number;
  collectedAmount: number;
  remainingAmount: number;
  collectAmount: number;
  debtId?: string;
  invoiceId?: string;
}

export interface LedgerCashVoucherSkuLine {
  sku: string;
  name: string;
  warehouse: string;
  location?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
}

export interface LedgerCashGoodsReceiptInfo {
  receiptNo: string;
  receiptDate: Date;
  receiptTime: string;
  delivererName: string;
  narrative: string;
  purchaseEmployeeCode: string;
  purchaseEmployeeName: string;
}

export interface LedgerCashVoucherDetail {
  kind: LedgerCashVoucherKindEnum;
  purpose: LedgerCashVoucherPurposeEnum;
  paymentPurpose?: CashPaymentPurpose;
  voucherNo: string;
  voucherDate: Date;
  counterpartyCode: string;
  counterpartyName: string;
  partnerKind?: PartnerLookupType;
  partnerType?: CashVoucherPartnerType;
  partnerId?: string;
  payerName?: string;
  address?: string;
  reason: string;
  employeeCode: string;
  employeeName: string;
  staffId?: string;
  reference?: string;
  lines: LedgerCashVoucherLine[];
  documentLines?: LedgerCashVoucherDocumentLine[];
  skuLines?: LedgerCashVoucherSkuLine[];
  discountAmount?: number;
  taxAmount?: number;
  goodsReceipt?: LedgerCashGoodsReceiptInfo;
  paymentMode?: LedgerCashVoucherPaymentModeEnum;
  paymentMethod?: string;
  receiveWithInvoice?: boolean;
  transferAccountId?: string;
}

export function isGoodsReceiptPaymentVoucher(
  detail: LedgerCashVoucherDetail,
): boolean {
  return (
    detail.kind === LedgerCashVoucherKindEnum.PAYMENT &&
    detail.goodsReceipt != null
  );
}

export type LedgerCashDetailPayload =
  | { type: LedgerCashDetailTypeEnum.INVOICE; data: LedgerCashInvoiceDetail }
  | { type: LedgerCashDetailTypeEnum.VOUCHER; data: LedgerCashVoucherDetail };

export interface LedgerCashRow {
  id: string;
  /** BE cash receipt/payment id for drill-down (when kind is PT/PC). */
  apiVoucherId?: string;
  apiLedgerKind?: "PT" | "PC" | "Khác";
  documentDate: Date;
  receiptNo?: string;
  paymentNo?: string;
  description: string;
  amountIn: number;
  amountOut: number;
  balance: number;
  counterparty: string;
  employee: string;
  documentType: LedgerCashDocumentTypeEnum;
  detail: LedgerCashDetailPayload;
}

export function resolveLedgerCashDrillDown(
  row: LedgerCashRow,
): LedgerCashDrillDownEnum | null {
  if (row.documentType === LedgerCashDocumentTypeEnum.OPENING_BALANCE) {
    return null;
  }
  if (
    row.documentType === LedgerCashDocumentTypeEnum.INVOICE_SALE ||
    row.documentType === LedgerCashDocumentTypeEnum.INVOICE_RETURN
  ) {
    return LedgerCashDrillDownEnum.INVOICE;
  }
  if (
    row.documentType === LedgerCashDocumentTypeEnum.CASH_RECEIPT ||
    row.documentType === LedgerCashDocumentTypeEnum.CASH_PAYMENT ||
    row.documentType === LedgerCashDocumentTypeEnum.GOODS_RECEIPT_PAYMENT
  ) {
    return LedgerCashDrillDownEnum.VOUCHER;
  }
  return null;
}

export function isOpeningBalanceRow(row: LedgerCashRow): boolean {
  return row.documentType === LedgerCashDocumentTypeEnum.OPENING_BALANCE;
}

export function resolveInvoiceCodeFromVoucher(
  detail: LedgerCashVoucherDetail,
): string | null {
  if (detail.reference?.trim()) return detail.reference.trim();
  const firstDoc = detail.documentLines?.[0]?.documentNo;
  return firstDoc?.trim() || null;
}
