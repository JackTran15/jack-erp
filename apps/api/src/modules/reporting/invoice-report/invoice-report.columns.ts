import { ReportColumnDataType } from '@erp/shared-interfaces';

export type ReportBandId = 'revenue' | 'customerPayment';

/** Invoice numeric fields that are plain-summed per day. */
export type InvoiceSumField =
  | 'subtotal'
  | 'discountAmount'
  | 'pointsDiscountAmount'
  | 'totalPaid';

/** How a fixed column's daily value is produced from a day's aggregate (internal — not exposed in the catalog). */
export type SummarySource =
  | { kind: 'groupKey' } // the `date` column
  | { kind: 'invoiceSum'; field: InvoiceSumField } // Σ of an invoice numeric field
  | { kind: 'cashPayments' } // Σ invoice_payments.amount where method = cash
  | { kind: 'voucherPromotions' } // Σ invoice_promotions.discount_amount where type = voucher
  | { kind: 'computed'; computed: 'total' | 'actual' | 'promoRate' };

export interface SummaryColumnDef {
  key: string;
  group: ReportBandId | null;
  type: ReportColumnDataType;
  source: SummarySource;
}

/**
 * Curated whitelist of FIXED summary columns. Only columns with a real backing
 * field are listed — "Tiền phí" (fee) is intentionally omitted (no invoice
 * column exists for it). Dynamic per-payment-method columns are appended at
 * request time from PaymentAccountEntity (see the catalog handler).
 */
export const INVOICE_REPORT_SUMMARY_COLUMNS: SummaryColumnDef[] = [
  { key: 'date', group: null, type: ReportColumnDataType.DATE, source: { kind: 'groupKey' } },
  { key: 'actualRevenue', group: null, type: ReportColumnDataType.CURRENCY, source: { kind: 'computed', computed: 'actual' } },
  { key: 'revenue.goods', group: 'revenue', type: ReportColumnDataType.CURRENCY, source: { kind: 'invoiceSum', field: 'subtotal' } },
  { key: 'revenue.discount', group: 'revenue', type: ReportColumnDataType.CURRENCY, source: { kind: 'invoiceSum', field: 'discountAmount' } },
  { key: 'revenue.promoPoints', group: 'revenue', type: ReportColumnDataType.CURRENCY, source: { kind: 'invoiceSum', field: 'pointsDiscountAmount' } },
  { key: 'revenue.total', group: 'revenue', type: ReportColumnDataType.CURRENCY, source: { kind: 'computed', computed: 'total' } },
  { key: 'revenue.promoRate', group: 'revenue', type: ReportColumnDataType.PERCENT, source: { kind: 'computed', computed: 'promoRate' } },
  { key: 'revenue.cash', group: 'revenue', type: ReportColumnDataType.CURRENCY, source: { kind: 'cashPayments' } },
  { key: 'payment.voucher', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, source: { kind: 'voucherPromotions' } },
  { key: 'payment.points', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, source: { kind: 'invoiceSum', field: 'pointsDiscountAmount' } },
];

const BY_KEY = new Map(INVOICE_REPORT_SUMMARY_COLUMNS.map((c) => [c.key, c]));

export const isKnownSummaryColumn = (key: string): boolean => BY_KEY.has(key);
export const getSummaryColumnDef = (key: string): SummaryColumnDef | undefined => BY_KEY.get(key);

/** Dynamic payment column key — keyed by the COA account id (what invoice_payments stores). */
const DYNAMIC_RE = /^payment\.method\.([0-9a-fA-F-]{36})$/;
export const isDynamicColumnKey = (key: string): boolean => DYNAMIC_RE.test(key);
export const parseDynamicColumnKey = (key: string): { accountId: string } | null => {
  const m = DYNAMIC_RE.exec(key);
  return m ? { accountId: m[1] } : null;
};
export const dynamicColumnKey = (coaAccountId: string): string => `payment.method.${coaAccountId}`;

/** True when the key is either a known fixed column or a well-formed dynamic payment column. */
export const isAcceptedColumnKey = (key: string): boolean =>
  isKnownSummaryColumn(key) || isDynamicColumnKey(key);
