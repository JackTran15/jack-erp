import {
  CASH_FUND_REPORT_COLUMN_LABELS_VI,
  REPORT_DOMAIN_PERMISSIONS,
  ReportColumnDataType,
  ReportColumnFilterKind,
  ReportColumnHeader,
  ReportFilterOption,
} from '@erp/shared-interfaces';
import {
  ReportDefinition as CoreReportDefinition,
  ReportRegistry as CoreReportRegistry,
} from '../report-core/report-definition';
import { reportColumnWidth } from '../report-core/report-column-widths';
import { CashFundReportSearchDto } from './dto/cash-fund-report-search.dto';

/** Widens a cash-fund report from the actor's assigned branches to the whole organization. */
export const CASH_CONSOLIDATED = REPORT_DOMAIN_PERMISSIONS.cash.consolidated;

/**
 * Cash-fund specialization of the generic report core (mirrors
 * debt-report/report-definition.ts). Nothing is widened: every cash-fund
 * report has a fixed column set, so the core contract is used as is.
 */
export type ReportDefinition = CoreReportDefinition<CashFundReportSearchDto>;

/** Indexes the registered cash-fund report definitions by key (DI class token). */
export class ReportRegistry extends CoreReportRegistry<ReportDefinition> {}

const NUMBER_TYPES = new Set<ReportColumnDataType>([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

function filterKindFor(type: ReportColumnDataType): ReportColumnFilterKind {
  if (type === ReportColumnDataType.DATE || type === ReportColumnDataType.DATETIME) {
    return 'date';
  }
  if (NUMBER_TYPES.has(type)) return 'number';
  return 'text';
}

export interface CashFundColumnOptions {
  /** Cell renders as a link (drill-down or open the voucher). */
  link?: boolean;
  /** Pinned to the left of the grid. */
  pinned?: boolean;
  /** Static choices for an enum column — turns the filter row into a select. */
  filterOptions?: ReportFilterOption[];
  /** `none` for columns that must not be filtered (e.g. the summary label). */
  filterKind?: ReportColumnFilterKind;
}

/**
 * Build one column header from its key + type. Labels come from the shared VI
 * map so backend source stays English; alignment / filterKind / width are
 * derived the same way as debt-report's `debtColumn`.
 */
export function cashFundColumn(
  col: string,
  type: ReportColumnDataType,
  options: CashFundColumnOptions = {},
): ReportColumnHeader {
  const width = reportColumnWidth(col);
  const filterKind =
    options.filterKind ?? (options.filterOptions ? 'select' : filterKindFor(type));
  return {
    col,
    name: CASH_FUND_REPORT_COLUMN_LABELS_VI[col] ?? col,
    desc: null,
    type,
    group: null,
    filterKind,
    align: NUMBER_TYPES.has(type) ? 'right' : 'left',
    ...(options.filterOptions ? { filterOptions: options.filterOptions } : {}),
    ...(options.link ? { link: true } : {}),
    ...(options.pinned ? { pinned: 'left' as const } : {}),
    ...(width !== undefined ? { width } : {}),
  };
}
