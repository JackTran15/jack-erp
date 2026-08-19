import {
  INVOICE_STATUS_OPTIONS,
  ReportCellValue,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
import { parseDynamicColumnKey } from './invoice-report.columns';
import {
  getListingColumnDef,
  ListingInvoiceField,
  ListingRelation,
} from './invoice-listing.columns';

/**
 * One invoice row, with relations already resolved INLINE (customer/branch/
 * employee joined and flattened onto the row, not a root `{[id]: X}` map) and
 * payments pre-pivoted (per method + per COA account). The report's buildData
 * fetches + assembles these; the aggregator stays pure for testing.
 */
export interface InvoiceRowInput {
  id: string;
  issuedAt: Date;
  code: string;
  status: string;
  subtotal: number;
  discountAmount: number;
  pointsDiscountAmount: number;
  totalPaid: number;
  amountDue: number;
  note: string | null;
  customerName: string | null;
  customerPhone: string | null;
  cashier: string | null;
  salesperson: string | null;
  storeCode: string | null;
  /** Σ invoice_payments.amount where method = cash. */
  cash: number;
  /** Σ invoice_payments.amount where method = bank_transfer. */
  bankTransfer: number;
  /** Σ invoice_promotions.discount_amount where type = voucher. */
  voucher: number;
  /** COA accountId -> Σ payment amount (backs dynamic `payment.method.<id>` columns). */
  byAccount: Record<string, number>;
}

const DEBT_STATUSES = new Set(['debt', 'partial_debt']);
const round2 = (n: number): number => Math.round(n * 100) / 100;

const invoiceFieldValue = (
  field: ListingInvoiceField,
  r: InvoiceRowInput,
): ReportCellValue => {
  switch (field) {
    case 'issuedAtDate':
      return r.issuedAt.toISOString().slice(0, 10);
    case 'issuedAtTime':
      return r.issuedAt.toISOString().slice(11, 16);
    case 'code':
      return r.code;
    case 'status':
      return r.status;
    case 'subtotal':
      return r.subtotal;
    case 'discountAmount':
      return r.discountAmount;
    case 'pointsDiscountAmount':
      return r.pointsDiscountAmount;
    case 'totalPaid':
      return r.totalPaid;
    case 'note':
      return r.note ?? null;
  }
};

const relationValue = (
  rel: ListingRelation,
  r: InvoiceRowInput,
): ReportCellValue => {
  switch (rel) {
    case 'customerName':
      return r.customerName;
    case 'customerPhone':
      return r.customerPhone;
    case 'cashier':
      return r.cashier;
    case 'salesperson':
      return r.salesperson;
    case 'storeCode':
      return r.storeCode;
  }
};

/** Value of one column for one invoice (the value the FE shows AND that per-column filters apply to). */
export function listingCellValue(
  col: string,
  r: InvoiceRowInput,
): ReportCellValue {
  const dyn = parseDynamicColumnKey(col);
  if (dyn) return r.byAccount[dyn.accountId] ?? 0;

  const def = getListingColumnDef(col);
  if (!def) return null;
  switch (def.source.kind) {
    case 'placeholder':
      return def.source.placeholder;
    case 'cashPayments':
      return r.cash;
    case 'bankTransferPayments':
      return r.bankTransfer;
    case 'voucherPromotions':
      return r.voucher;
    case 'relation':
      return relationValue(def.source.rel, r);
    case 'invoiceField':
      return invoiceFieldValue(def.source.field, r);
    case 'computed':
      if (def.source.computed === 'total') {
        // Mirrors daily-sales revenue.total; fee is a placeholder (0) in v1.
        return r.subtotal - r.discountAmount - r.pointsDiscountAmount;
      }
      if (def.source.computed === 'debt') {
        return DEBT_STATUSES.has(r.status)
          ? Math.max(r.amountDue - r.totalPaid, 0)
          : 0;
      }
      // promoRate — discount as a percentage of goods (mirrors daily-sales).
      return r.subtotal > 0
        ? round2((r.discountAmount / r.subtotal) * 100)
        : 0;
  }
}

export function listingColumnType(col: string): ReportColumnDataType {
  if (parseDynamicColumnKey(col)) return ReportColumnDataType.CURRENCY;
  return getListingColumnDef(col)?.type ?? ReportColumnDataType.STRING;
}

/**
 * Vietnamese label per invoice status, from the very list the "Trạng thái"
 * select is built out of — one source of truth, so the cell can never read
 * `paid` while the filter above it offers "Hoàn thành".
 */
const STATUS_LABEL_VI = new Map(
  INVOICE_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

/**
 * Display value of a cell. Same as `listingCellValue` except that `status` is
 * translated.
 *
 * The translation lives HERE and not in `listingCellValue` on purpose: that one
 * also feeds the per-column filters, which receive the option *value* (`paid`)
 * from the select. Translating there would leave the filter comparing "Hoàn
 * thành" against `paid` and matching nothing.
 */
function listingDisplayValue(col: string, r: InvoiceRowInput): ReportCellValue {
  const value = listingCellValue(col, r);
  if (col !== 'status' || typeof value !== 'string') return value;
  // An unmapped status prints as-is rather than blank — visible, not lost.
  return STATUS_LABEL_VI.get(value) ?? value;
}

export function buildInvoiceRow(
  columns: string[],
  r: InvoiceRowInput,
): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = listingDisplayValue(col, r);
  return row;
}

/** Footer totals — only money columns (currency/number) are summed; others have no meaningful total. */
export function buildListingTotals(
  columns: string[],
  rows: InvoiceRowInput[],
): ReportRow {
  const out: ReportRow = {};
  for (const col of columns) {
    const type = listingColumnType(col);
    const summable =
      type === ReportColumnDataType.CURRENCY ||
      type === ReportColumnDataType.NUMBER;
    out[col] = summable
      ? round2(
          rows.reduce((sum, r) => sum + Number(listingCellValue(col, r) ?? 0), 0),
        )
      : null;
  }
  return out;
}
