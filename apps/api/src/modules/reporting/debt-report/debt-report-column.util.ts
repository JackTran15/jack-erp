import {
  DEBT_REPORT_COLUMN_DESCS,
  DEBT_REPORT_COLUMN_LABELS_VI,
  ReportColumnDataType,
  ReportColumnFilterKind,
  ReportColumnGroup,
  ReportColumnHeader,
} from '@erp/shared-interfaces';

const NUMBER_TYPES = new Set<ReportColumnDataType>([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

/** Columns rendered as a link (drill-down to the customer/supplier or the source document). */
const LINK_COLUMNS = new Set(['customerName', 'documentNumber']);

/** Leading identity columns are pinned to the left. */
const PINNED_LEFT = new Set([
  'customerCode',
  'customerName',
  'supplierCode',
  'supplierName',
  'date',
  'documentNumber',
]);

function filterKindFor(type: ReportColumnDataType): ReportColumnFilterKind {
  if (type === ReportColumnDataType.DATE || type === ReportColumnDataType.DATETIME) {
    return 'date';
  }
  if (NUMBER_TYPES.has(type)) return 'number';
  return 'text';
}

/**
 * Build one column header from just its key + type (+ optional group). Labels
 * and formula sub-labels come from the shared VI maps so backend source stays
 * English; alignment/pin/link/filterKind are derived the same way as
 * invoice-report's enrichHeader.
 */
export function debtColumn(
  col: string,
  type: ReportColumnDataType,
  group: ReportColumnGroup | null = null,
): ReportColumnHeader {
  return {
    col,
    name: DEBT_REPORT_COLUMN_LABELS_VI[col] ?? col,
    desc: DEBT_REPORT_COLUMN_DESCS[col] ?? null,
    type,
    group,
    filterKind: filterKindFor(type),
    align: NUMBER_TYPES.has(type) ? 'right' : 'left',
    ...(LINK_COLUMNS.has(col) ? { link: true } : {}),
    ...(PINNED_LEFT.has(col) ? { pinned: 'left' as const } : {}),
  };
}
