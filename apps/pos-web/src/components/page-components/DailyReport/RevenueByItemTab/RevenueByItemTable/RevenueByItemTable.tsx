import { useMemo } from "react";
import { cn } from "@erp/ui";
import type { ReportRow } from "@erp/shared-interfaces";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import {
  DAILY_REPORT_REVENUE_COLUMN_LABELS,
  DAILY_REPORT_REVENUE_COLUMN_ORDER,
  DAILY_REPORT_REVENUE_NUMERIC_COLUMNS,
  DailyReportRevenueColumnKey,
} from "@erp/pos/constants/daily-report.constant";
import { formatNumberVi } from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";

export interface RevenueByItemTableProps {
  rows: ReadonlyArray<ReportRow>;
  totalsRow: ReportRow | null;
  loading: boolean;
  visibleColumns: ReadonlySet<DailyReportRevenueColumnKey>;
  filters: Record<DailyReportRevenueColumnKey, string>;
  filterOperators: Record<DailyReportRevenueColumnKey, FilterOperatorEnum>;
  onFilterChange: (key: DailyReportRevenueColumnKey, value: string) => void;
  onFilterOperatorChange: (
    key: DailyReportRevenueColumnKey,
    op: FilterOperatorEnum,
  ) => void;
}

function cellText(row: ReportRow, col: string): string {
  const value = row[col];
  if (DAILY_REPORT_REVENUE_NUMERIC_COLUMNS.has(col as DailyReportRevenueColumnKey)) {
    return formatNumberVi(value);
  }
  return value === null || value === undefined ? "" : String(value);
}

export function RevenueByItemTable({
  rows,
  totalsRow,
  loading,
  visibleColumns,
  filters,
  filterOperators,
  onFilterChange,
  onFilterOperatorChange,
}: RevenueByItemTableProps) {
  const allColumns = useMemo<
    Record<DailyReportRevenueColumnKey, PosDataTableColumn<ReportRow>>
  >(() => {
    const entries = DAILY_REPORT_REVENUE_COLUMN_ORDER.map((key) => {
      const numeric = DAILY_REPORT_REVENUE_NUMERIC_COLUMNS.has(key);
      const column: PosDataTableColumn<ReportRow> = {
        key,
        title: DAILY_REPORT_REVENUE_COLUMN_LABELS[key],
        align: numeric ? "right" : "left",
        cellClassName: cn("whitespace-nowrap", numeric && "tabular-nums"),
        headerClassName: "whitespace-nowrap",
        render: (row) => cellText(row, key),
        filterRender: (
          <PosDataTableFilterCell
            value={filters[key]}
            onChange={(next) => onFilterChange(key, next)}
            operatorType={
              numeric ? FilterOperatorTypeEnum.NUMBER : FilterOperatorTypeEnum.TEXT
            }
            leadingOperator={
              numeric ? FilterOperatorEnum.EQUALS : FilterOperatorEnum.CONTAINS
            }
            operator={filterOperators[key]}
            onOperatorChange={(op) => onFilterOperatorChange(key, op)}
            align={numeric ? "right" : "left"}
          />
        ),
      };
      return [key, column] as const;
    });
    return Object.fromEntries(entries) as Record<
      DailyReportRevenueColumnKey,
      PosDataTableColumn<ReportRow>
    >;
  }, [filters, filterOperators, onFilterChange, onFilterOperatorChange]);

  const columns = useMemo(
    () =>
      DAILY_REPORT_REVENUE_COLUMN_ORDER.filter((key) => visibleColumns.has(key)).map(
        (key) => allColumns[key],
      ),
    [allColumns, visibleColumns],
  );

  const summaryRow = totalsRow ? (
    <tr className="h-11 border-t border-gray-200 text-[14px] font-semibold text-gray-900">
      {columns.map((column, i) => (
        <td
          key={column.key}
          className={cn(
            "whitespace-nowrap px-3",
            column.align === "right" ? "text-right tabular-nums" : "text-left",
          )}
        >
          {i === 0
            ? "Tổng"
            : DAILY_REPORT_REVENUE_NUMERIC_COLUMNS.has(
                  column.key as DailyReportRevenueColumnKey,
                ) && totalsRow[column.key] !== null
              ? formatNumberVi(totalsRow[column.key])
              : ""}
        </td>
      ))}
    </tr>
  ) : undefined;

  return (
    <div className="h-full overflow-auto">
      <PosDataTable<ReportRow>
        columns={columns}
        dataSource={rows}
        rowKey={(row) => String(row.sku ?? "")}
        emptyText={loading ? "Đang tải..." : "Không có dữ liệu"}
        summaryRow={summaryRow}
      />
    </div>
  );
}
