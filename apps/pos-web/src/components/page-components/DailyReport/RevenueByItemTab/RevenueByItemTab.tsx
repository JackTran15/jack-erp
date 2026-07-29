import { PosPaginationBar } from "@erp/pos/components/common/PosPaginationBar/PosPaginationBar";
import type { ReportRow } from "@erp/shared-interfaces";
import type { FilterOperatorEnum } from "@erp/pos/constants/checkout.constant";
import type { DailyReportRevenueColumnKey } from "@erp/pos/constants/daily-report.constant";
import { RevenueByItemTable } from "./RevenueByItemTable/RevenueByItemTable";
import { RevenueColumnSettingsDialog } from "./RevenueColumnSettingsDialog/RevenueColumnSettingsDialog";

export interface RevenueByItemTabProps {
  rows: ReadonlyArray<ReportRow>;
  totalsRow: ReportRow | null;
  loading: boolean;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onRefresh: () => void;
  visibleColumns: ReadonlySet<DailyReportRevenueColumnKey>;
  filters: Record<DailyReportRevenueColumnKey, string>;
  filterOperators: Record<DailyReportRevenueColumnKey, FilterOperatorEnum>;
  onFilterChange: (key: DailyReportRevenueColumnKey, value: string) => void;
  onFilterOperatorChange: (
    key: DailyReportRevenueColumnKey,
    op: FilterOperatorEnum,
  ) => void;
  columnSettingsOpen: boolean;
  onCloseColumnSettings: () => void;
  onApplyVisibleColumns: (next: ReadonlySet<DailyReportRevenueColumnKey>) => void;
}

export function RevenueByItemTab({
  rows,
  totalsRow,
  loading,
  page,
  pageSize,
  total,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  visibleColumns,
  filters,
  filterOperators,
  onFilterChange,
  onFilterOperatorChange,
  columnSettingsOpen,
  onCloseColumnSettings,
  onApplyVisibleColumns,
}: RevenueByItemTabProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <RevenueByItemTable
          rows={rows}
          totalsRow={totalsRow}
          loading={loading}
          visibleColumns={visibleColumns}
          filters={filters}
          filterOperators={filterOperators}
          onFilterChange={onFilterChange}
          onFilterOperatorChange={onFilterOperatorChange}
        />
      </div>
      <PosPaginationBar
        page={page}
        totalPages={totalPages}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onRefresh={onRefresh}
      />

      <RevenueColumnSettingsDialog
        open={columnSettingsOpen}
        visibleColumns={visibleColumns}
        onApply={onApplyVisibleColumns}
        onClose={onCloseColumnSettings}
      />
    </div>
  );
}
