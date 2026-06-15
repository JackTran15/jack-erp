import { ReportColumnDataType } from '@erp/shared-interfaces';

/**
 * Column registry for the `invoice-item-revenue-detail` report (MISA-style
 * "Chi tiết doanh thu theo hóa đơn và mặt hàng") — ONE ROW PER INVOICE LINE
 * ITEM. Kept separate from `invoice-listing.columns.ts` (per-invoice) and
 * `invoice-report.columns.ts` (per-day) so the three reports never interfere.
 *
 * The column set is FLAT (no bands) and has NO dynamic payment-method columns.
 *
 * Every column declares a `classification`:
 *  - `backed`      — a real field on the line/invoice or an inline-resolved relation.
 *  - `derived`     — computed server-side (line gross = quantity * unitPrice).
 *  - `placeholder` — no backing data yet (promo points per line, reference, bank
 *    account, sales channel, receiver). Returns a deterministic 0/null until a
 *    future epic adds the data. Mirrors the MISA column set 1:1.
 */
export type ItemRevenueClassification = 'backed' | 'derived' | 'placeholder';

/** Fields read straight off the line item or its parent invoice. */
export type ItemRevenueField =
  | 'issuedAtDate'
  | 'issuedAtTime'
  | 'invoiceCode'
  | 'invoiceNote'
  | 'itemCode'
  | 'itemName'
  | 'unit'
  | 'quantity'
  | 'unitPrice'
  | 'lineDiscount'
  | 'lineTotal'
  | 'itemNote';

/** Inline-resolved relation value (joined object flattened per row, not a root map). */
export type ItemRevenueRelation =
  | 'itemCategory'
  | 'locationCode'
  | 'locationName'
  | 'customerCode'
  | 'customerName'
  | 'customerGroup'
  | 'customerPhone'
  | 'cashierCode'
  | 'cashierName'
  | 'salespersonCode'
  | 'salespersonName'
  | 'storeName'
  | 'supplier';

/** How a column's per-line value is produced (internal — not exposed in the catalog). */
export type ItemRevenueSource =
  | { kind: 'field'; field: ItemRevenueField }
  | { kind: 'relation'; rel: ItemRevenueRelation }
  | { kind: 'computed'; computed: 'lineAmount' }
  | { kind: 'placeholder'; placeholder: 0 | null };

export interface ItemRevenueColumnDef {
  key: string;
  type: ReportColumnDataType;
  classification: ItemRevenueClassification;
  source: ItemRevenueSource;
}

/**
 * Curated whitelist mirroring the MISA invoice & item revenue-detail columns,
 * in the on-screen order. `desc` (formula sub-label) is intentionally null for
 * this report — its values are direct line fields, not MISA formula derivations.
 *
 * `storeCode` and `storeName` both resolve to the branch name: BranchEntity has
 * no separate code column (mirrors `invoice-order-listing`'s `storeCode`).
 */
export const INVOICE_ITEM_REVENUE_COLUMNS: ItemRevenueColumnDef[] = [
  { key: 'date', type: ReportColumnDataType.DATE, classification: 'backed', source: { kind: 'field', field: 'issuedAtDate' } },
  { key: 'time', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'issuedAtTime' } },
  { key: 'invoiceCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'invoiceCode' } },
  { key: 'sku', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'itemCode' } },
  { key: 'itemName', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'itemName' } },
  { key: 'itemCategory', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'itemCategory' } },
  { key: 'unit', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'unit' } },
  { key: 'quantity', type: ReportColumnDataType.NUMBER, classification: 'backed', source: { kind: 'field', field: 'quantity' } },
  { key: 'unitPrice', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'field', field: 'unitPrice' } },
  { key: 'lineAmount', type: ReportColumnDataType.CURRENCY, classification: 'derived', source: { kind: 'computed', computed: 'lineAmount' } },
  { key: 'lineDiscount', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'field', field: 'lineDiscount' } },
  { key: 'revenue.promoPoints', type: ReportColumnDataType.CURRENCY, classification: 'placeholder', source: { kind: 'placeholder', placeholder: 0 } },
  { key: 'lineRevenue', type: ReportColumnDataType.CURRENCY, classification: 'backed', source: { kind: 'field', field: 'lineTotal' } },
  { key: 'reference', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'locationCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'locationCode' } },
  { key: 'locationName', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'locationName' } },
  { key: 'payment.bankAccount', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'customerCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerCode' } },
  { key: 'customer', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerName' } },
  { key: 'customerGroup', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerGroup' } },
  { key: 'customerPhone', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'customerPhone' } },
  { key: 'salesChannel', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'cashierCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'cashierCode' } },
  { key: 'cashier', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'cashierName' } },
  { key: 'salespersonCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'salespersonCode' } },
  { key: 'salesperson', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'salespersonName' } },
  { key: 'receiver', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'receiverPhone', type: ReportColumnDataType.STRING, classification: 'placeholder', source: { kind: 'placeholder', placeholder: null } },
  { key: 'storeCode', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'storeName' } },
  { key: 'storeName', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'storeName' } },
  { key: 'invoiceNote', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'invoiceNote' } },
  { key: 'itemNote', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'field', field: 'itemNote' } },
  { key: 'supplier', type: ReportColumnDataType.STRING, classification: 'backed', source: { kind: 'relation', rel: 'supplier' } },
];

const BY_KEY = new Map(INVOICE_ITEM_REVENUE_COLUMNS.map((c) => [c.key, c]));

export const isKnownItemRevenueColumn = (key: string): boolean => BY_KEY.has(key);
export const getItemRevenueColumnDef = (
  key: string,
): ItemRevenueColumnDef | undefined => BY_KEY.get(key);
