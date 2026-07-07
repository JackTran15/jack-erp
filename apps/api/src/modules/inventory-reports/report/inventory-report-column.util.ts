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

/** Build the enriched catalog headers of one inventory report. */
export function buildInventoryHeaders(
  reportKey: InventoryReportKey,
  defs: InventoryColumnDef[],
  pinnedLeft: string[],
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
      filterKind: d.filterKind ?? filterKindFor(d.type, d.key),
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
