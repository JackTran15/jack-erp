import { ReportColumnDataType } from '@erp/shared-interfaces';
import { isDynamicColumnKey } from './invoice-report.columns';

/**
 * Column registry for the `invoice-order-listing` report (MISA-style invoice &
 * order listing) — ONE ROW PER INVOICE. Kept separate from
 * `invoice-report.columns.ts` (the per-day `daily-sales-summary` registry) so
 * the two reports never interfere.
 *
 * Every column declares a `classification`:
 *  - `backed`      — a real field/aggregate in the current schema.
 *  - `derived`     — computed server-side from backed fields.
 *  - `placeholder` — no backing data yet (marketplace fees, collect-on-behalf,
 *    bank-account string, sales channel, fee). Returns a deterministic 0/null
 *    until a future epic adds the data. Mirrors the MISA column set 1:1.
 */
export type ListingClassification = 'backed' | 'derived' | 'placeholder';
export type ListingBandId = 'revenue' | 'customerPayment' | 'platform';

/** Invoice numeric/string fields read straight off the invoice row. */
export type ListingInvoiceField =
  | 'issuedAtDate'
  | 'issuedAtTime'
  | 'code'
  | 'status'
  | 'subtotal'
  | 'discountAmount'
  | 'pointsDiscountAmount'
  | 'totalPaid'
  | 'note';

/** Inline-resolved relation value (joined object inlined per row, not a root map). */
export type ListingRelation =
  | 'customerName'
  | 'customerPhone'
  | 'cashier'
  | 'salesperson'
  | 'storeCode';

/** How a fixed column's per-invoice value is produced (internal — not exposed in the catalog). */
export type ListingSource =
  | { kind: 'invoiceField'; field: ListingInvoiceField }
  | { kind: 'cashPayments' } // Σ invoice_payments.amount where method = cash
  | { kind: 'bankTransferPayments' } // Σ invoice_payments.amount where method = bank_transfer
  | { kind: 'voucherPromotions' } // Σ invoice_promotions.discount_amount where type = voucher
  | { kind: 'relation'; rel: ListingRelation }
  | { kind: 'computed'; computed: 'total' | 'promoRate' | 'debt' }
  | { kind: 'placeholder'; placeholder: 0 | null };

export interface ListingColumnDef {
  key: string;
  /** Band; null for the leading ungrouped columns (date, time, invoiceCode, status). */
  group: ListingBandId | null;
  type: ReportColumnDataType;
  classification: ListingClassification;
  source: ListingSource;
}

/**
 * Curated whitelist mirroring the MISA invoice & order listing columns.
 * Dynamic per-payment-account columns (`payment.method.<coaAccountId>`) are
 * appended at request time from PaymentAccountEntity (see the report's
 * buildColumns), exactly like the daily-sales report.
 *
 * `desc` (formula sub-label) is intentionally omitted in v1 — the MISA numbering
 * (e.g. "(1)=(2)+(3)-(4)-(5)-(16)") is reconciled against the source report
 * separately; reusing the daily-sales desc map here would show wrong formulas.
 */
export const INVOICE_LISTING_COLUMNS: ListingColumnDef[] = [
  // Leading ungrouped columns
  { key: 'date', group: null, type: ReportColumnDataType.DATE, classification: 'backed', source: { kind: 'invoiceField', field: 'issuedAtDate' } },
  { key: 'time', group: null, type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'invoiceField', field: 'issuedAtTime' } },
  { key: 'invoiceCode', group: null, type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'invoiceField', field: 'code' } },
  { key: 'status', group: null, type: ReportColumnDataType.ENUM, classification: 'backed', source: { kind: 'invoiceField', field: 'status' } },

  // Band: revenue
  { key: 'revenue.total', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'derived', source: { kind: 'computed', computed: 'total' } },
  { key: 'revenue.goods', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'invoiceField', field: 'subtotal' } },
  { key: 'revenue.fee', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'revenue.discount', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'invoiceField', field: 'discountAmount' } },
  { key: 'revenue.promoPoints', group: 'revenue', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'invoiceField', field: 'pointsDiscountAmount' } },
  { key: 'revenue.promoRate', group: 'revenue', type: ReportColumnDataType.PERCENT, classification: 'derived', source: { kind: 'computed', computed: 'promoRate' } },

  // Band: customerPayment
  { key: 'payment.voucher', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'voucherPromotions' } },
  { key: 'payment.points', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'invoiceField', field: 'pointsDiscountAmount' } },
  { key: 'payment.debt', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'derived', source: { kind: 'computed', computed: 'debt' } },
  { key: 'payment.collectOnBehalf', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'payment.cash', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'cashPayments' } },
  { key: 'payment.bankTransfer', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'bankTransferPayments' } },
  { key: 'actualRevenue', group: 'customerPayment', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'invoiceField', field: 'totalPaid' } },
  { key: 'payment.bankAccount', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'customer', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerName' } },
  { key: 'customerPhone', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerPhone' } },
  { key: 'salesChannel', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'cashier', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'cashier' } },
  { key: 'salesperson', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'salesperson' } },
  { key: 'note', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'invoiceField', field: 'note' } },
  { key: 'storeCode', group: 'customerPayment', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'storeCode' } },

  // Band: platform (marketplace) — no integration exists yet, so all columns are placeholders.
  { key: 'platform.fee', group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'platform.otherIncome', group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'platform.revenue', group: 'platform', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
];

const BY_KEY = new Map(INVOICE_LISTING_COLUMNS.map((c) => [c.key, c]));

export const isKnownListingColumn = (key: string): boolean => BY_KEY.has(key);
export const getListingColumnDef = (
  key: string,
): ListingColumnDef | undefined => BY_KEY.get(key);

/** True when the key is either a known fixed listing column or a well-formed dynamic payment column. */
export const isAcceptedListingColumn = (key: string): boolean =>
  isKnownListingColumn(key) || isDynamicColumnKey(key);
