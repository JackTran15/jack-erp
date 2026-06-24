import {
  ReportCellValue,
  ReportColumnDataType,
  ReportRow,
} from '@erp/shared-interfaces';
import {
  getItemRevenueColumnDef,
  ItemRevenueField,
  ItemRevenueRelation,
} from './invoice-item-revenue.columns';

/**
 * One invoice LINE ITEM, with its parent invoice header fields and all relations
 * already resolved INLINE (customer/branch/employee/item-category/location/
 * supplier joined and flattened onto the row, not a root `{[id]: X}` map). The
 * report's buildData fetches + assembles these; the aggregator stays pure for
 * testing.
 */
export interface InvoiceItemRowInput {
  invoiceId: string;
  sortOrder: number;
  // Invoice header (inlined)
  issuedAt: Date;
  invoiceCode: string;
  invoiceNote: string | null;
  // Line item
  itemCode: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  itemNote: string | null;
  // Resolved relations (inlined)
  itemCategory: string | null;
  locationCode: string | null;
  locationName: string | null;
  customerCode: string | null;
  customerName: string | null;
  customerGroup: string | null;
  customerPhone: string | null;
  cashierCode: string | null;
  cashierName: string | null;
  salespersonCode: string | null;
  salespersonName: string | null;
  storeName: string | null;
  supplier: string | null;
}

/** Per-unit price has no meaningful column total, so it is excluded from the footer. */
const NON_SUMMABLE = new Set<string>(['unitPrice']);
const round2 = (n: number): number => Math.round(n * 100) / 100;

const fieldValue = (
  field: ItemRevenueField,
  r: InvoiceItemRowInput,
): ReportCellValue => {
  switch (field) {
    case 'issuedAtDate':
      return r.issuedAt.toISOString().slice(0, 10);
    case 'issuedAtTime':
      return r.issuedAt.toISOString().slice(11, 16);
    case 'invoiceCode':
      return r.invoiceCode;
    case 'invoiceNote':
      return r.invoiceNote ?? null;
    case 'itemCode':
      return r.itemCode;
    case 'itemName':
      return r.itemName;
    case 'unit':
      return r.unit;
    case 'quantity':
      return r.quantity;
    case 'unitPrice':
      return r.unitPrice;
    case 'lineDiscount':
      return r.lineDiscount;
    case 'lineTotal':
      return r.lineTotal;
    case 'itemNote':
      return r.itemNote ?? null;
  }
};

const relationValue = (
  rel: ItemRevenueRelation,
  r: InvoiceItemRowInput,
): ReportCellValue => {
  switch (rel) {
    case 'itemCategory':
      return r.itemCategory;
    case 'locationCode':
      return r.locationCode;
    case 'locationName':
      return r.locationName;
    case 'customerCode':
      return r.customerCode;
    case 'customerName':
      return r.customerName;
    case 'customerGroup':
      return r.customerGroup;
    case 'customerPhone':
      return r.customerPhone;
    case 'cashierCode':
      return r.cashierCode;
    case 'cashierName':
      return r.cashierName;
    case 'salespersonCode':
      return r.salespersonCode;
    case 'salespersonName':
      return r.salespersonName;
    case 'storeName':
      return r.storeName;
    case 'supplier':
      return r.supplier;
  }
};

/** Value of one column for one line item (the value the FE shows AND that per-column filters apply to). */
export function itemCellValue(
  col: string,
  r: InvoiceItemRowInput,
): ReportCellValue {
  const def = getItemRevenueColumnDef(col);
  if (!def) return null;
  switch (def.source.kind) {
    case 'placeholder':
      return def.source.placeholder;
    case 'field':
      return fieldValue(def.source.field, r);
    case 'relation':
      return relationValue(def.source.rel, r);
    case 'computed':
      // lineAmount — gross line value before discount.
      return round2(r.quantity * r.unitPrice);
  }
}

export function itemColumnType(col: string): ReportColumnDataType {
  return getItemRevenueColumnDef(col)?.type ?? ReportColumnDataType.STRING;
}

export function buildItemRow(
  columns: string[],
  r: InvoiceItemRowInput,
): ReportRow {
  const row: ReportRow = {};
  for (const col of columns) row[col] = itemCellValue(col, r);
  return row;
}

/** Footer totals — money/quantity columns are summed; per-unit price and non-numeric columns have no meaningful total. */
export function buildItemTotals(
  columns: string[],
  rows: InvoiceItemRowInput[],
): ReportRow {
  const out: ReportRow = {};
  for (const col of columns) {
    const type = itemColumnType(col);
    const summable =
      !NON_SUMMABLE.has(col) &&
      (type === ReportColumnDataType.CURRENCY ||
        type === ReportColumnDataType.NUMBER);
    out[col] = summable
      ? round2(rows.reduce((sum, r) => sum + Number(itemCellValue(col, r) ?? 0), 0))
      : null;
  }
  return out;
}
