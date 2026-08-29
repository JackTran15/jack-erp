import {
  INVENTORY_REPORT_BAND_LABELS_VI,
  INVENTORY_REPORT_COLUMN_LABELS_VI,
  InventoryReportKey,
  ReportColumnDataType,
  ReportColumnGroup,
  ReportColumnHeader,
  ReportFilterOption,
} from '@erp/shared-interfaces';
import { filterKindFor } from '../../reporting/invoice-report/report-column.util';

const NUMBER_TYPES = new Set<ReportColumnDataType>([
  ReportColumnDataType.NUMBER,
  ReportColumnDataType.CURRENCY,
  ReportColumnDataType.PERCENT,
]);

/** One fixed column of an inventory report's catalog. */
export interface InventoryColumnDef {
  key: string;
  type: ReportColumnDataType;
  /** Band id (INVENTORY_REPORT_BAND_LABELS_VI[reportKey]); null = ungrouped. */
  band?: string | null;
  /** Override the derived filter widget (e.g. `select` for status columns). */
  filterKind?: ReportColumnHeader['filterKind'];
  filterOptions?: ReportFilterOption[];
  width?: number;
}

/**
 * Build the enriched catalog headers of one inventory report.
 *
 * `unfilterable` forces `filterKind: 'none'` on the named columns. It exists
 * because filterability is not a property of a column alone: the parent and
 * group grains re-aggregate in SQL and select NULL for the identity columns
 * they cannot speak for, and a filter box over a column that is always empty
 * either answers 400 or filters nothing (ADR-07). Which columns those are
 * depends on the grain, so the caller decides per request.
 */
export function buildInventoryHeaders(
  reportKey: InventoryReportKey,
  defs: InventoryColumnDef[],
  pinnedLeft: string[],
  unfilterable: ReadonlySet<string> = new Set(),
): ReportColumnHeader[] {
  const labels = INVENTORY_REPORT_COLUMN_LABELS_VI[reportKey] ?? {};
  const bandLabels = INVENTORY_REPORT_BAND_LABELS_VI[reportKey] ?? {};
  const pinned = new Set(pinnedLeft);

  return defs.map((d) => {
    const group: ReportColumnGroup | null = d.band
      ? { id: d.band, name: bandLabels[d.band] ?? d.band }
      : null;
    const header: ReportColumnHeader = {
      col: d.key,
      name: labels[d.key] ?? d.key,
      desc: null,
      type: d.type,
      group,
      filterKind: unfilterable.has(d.key)
        ? 'none'
        : (d.filterKind ?? filterKindFor(d.type, d.key)),
      align: NUMBER_TYPES.has(d.type) ? 'right' : 'left',
    };
    if (d.filterOptions) header.filterOptions = d.filterOptions;
    if (d.width !== undefined) header.width = d.width;
    if (pinned.has(d.key)) header.pinned = 'left';
    return header;
  });
}

/** Keys of the number-family columns in a column table (totals candidates). */
export function numericKeys(defs: InventoryColumnDef[]): Set<string> {
  return new Set(defs.filter((d) => NUMBER_TYPES.has(d.type)).map((d) => d.key));
}
