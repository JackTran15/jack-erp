import {
  INVOICE_STATUS_OPTIONS,
  ReportColumnDataType,
  ReportColumnFilterKind,
  ReportColumnHeader,
} from '@erp/shared-interfaces';

const NUMBER_TYPES = new Set<ReportColumnDataType>([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

/** Columns rendered as a link (drill-down). */
const LINK_COLUMNS = new Set(['invoiceCode', 'productName', 'itemName']);

/** Time-of-day columns get the dedicated time filter widget. */
const TIME_COLUMNS = new Set(['time', 'hour']);

/** Leading identity columns are pinned to the left. */
const PINNED_LEFT = new Set(['date', 'invoiceCode', 'sku']);

/** Derive the FE filter widget kind from a column's data type + key. */
export function filterKindFor(
  type: ReportColumnDataType,
  col: string,
): ReportColumnFilterKind {
  if (col === 'status') return 'select';
  if (TIME_COLUMNS.has(col)) return 'time';
  if (type === ReportColumnDataType.DATE || type === ReportColumnDataType.DATETIME) {
    return 'date';
  }
  if (NUMBER_TYPES.has(type)) return 'number';
  return 'text';
}

/**
 * Enrich a base {col,name,desc,type,group} header with the FE display + filter
 * metadata the chain-store table config needs (filterKind, filterOptions for
 * select columns, alignment, link, pinned). Backend owns this so the FE renders
 * uniformly from one source.
 */
export function enrichHeader(
  base: Pick<ReportColumnHeader, 'col' | 'name' | 'desc' | 'type' | 'group'>,
): ReportColumnHeader {
  const filterKind = filterKindFor(base.type, base.col);
  const header: ReportColumnHeader = {
    ...base,
    filterKind,
    align: NUMBER_TYPES.has(base.type) ? 'right' : 'left',
  };
  if (base.col === 'status') header.filterOptions = INVOICE_STATUS_OPTIONS;
  if (LINK_COLUMNS.has(base.col)) header.link = true;
  if (PINNED_LEFT.has(base.col)) header.pinned = 'left';
  return header;
}
