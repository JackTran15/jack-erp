import { toast } from "sonner";
import { DailyReportTabs } from "@erp/pos/components/page-components/DailyReport/DailyReportTabs/DailyReportTabs";
import { DailyReportToolbar } from "@erp/pos/components/page-components/DailyReport/DailyReportToolbar/DailyReportToolbar";
import { DailySummaryTab } from "@erp/pos/components/page-components/DailyReport/DailySummaryTab/DailySummaryTab";
import { RevenueByItemTab } from "@erp/pos/components/page-components/DailyReport/RevenueByItemTab/RevenueByItemTab";
import { PosDateRangeCustomDialog } from "@erp/pos/components/common/PosDateRangeFilter/PosDateRangeCustomDialog/PosDateRangeCustomDialog";
import { useDailyReport } from "@erp/pos/hooks/page-hooks/daily-report/use-daily-report";
import {
  useCurrentUserQuery,
} from "@erp/pos/hooks/react-query/use-query-user";
import {
  useExportDailySummaryMutation,
  useReportFilterOptionsQuery,
} from "@erp/pos/hooks/react-query/use-query-daily-report";
import { useMyBranchesQuery } from "@erp/pos/hooks/react-query/use-query-branch";
import { usePosBranchStore } from "@erp/pos/stores/common/branch.store";
import { splitDateTimeVi } from "@erp/pos/lib/common/dateRangeFilter";
import {
  formatPrintedAtVi,
  staffOptionName,
} from "@erp/pos/lib/page-libs/daily-report/formatDailyReport";
import type { DailyReportMeta } from "@erp/pos/lib/page-libs/daily-report/dailyReportPrintMeta";
import { renderDailySummaryPrintHtml } from "@erp/pos/lib/page-libs/daily-report/renderDailyReportHtml";
import { renderHandoverReceiptPrintHtml } from "@erp/pos/lib/page-libs/daily-report/renderHandoverReceiptHtml";
import { printDailyReport } from "@erp/pos/lib/page-libs/daily-report/printDailyReport";
import { exportDailyReportXls } from "@erp/pos/lib/page-libs/daily-report/exportDailyReportXls";

/**
 * Trang "Báo cáo theo ngày" (`/daily-report`). Shell: tabs + toolbar + nội dung
 * tab; modal chọn thời gian. Logic ở `use-daily-report`. In/Xuất (chỉ tab Tổng
 * hợp) render tài liệu A80 client-side: "BÁO CÁO TỔNG HỢP" (toolbar In/Xuất) và
 * "BÀN GIAO TIỀN" độc lập (nút "In bàn giao" trong HandoverPanel).
 */
export function DailyReportPage() {
  const dr = useDailyReport();
  const branchId = usePosBranchStore((s) => s.branchId);
  const branchName = usePosBranchStore((s) => s.branchName) ?? "";
  const branches = useMyBranchesQuery();
  const addressLine =
    branches.data?.find((b) => b.id === branchId)?.address ?? undefined;
  const me = useCurrentUserQuery();
  const cashiers = useReportFilterOptionsQuery("cashier");
  const salespeople = useReportFilterOptionsQuery("salesperson");

  const userName = me.data
    ? `${me.data.firstName ?? ""} ${me.data.lastName ?? ""}`.trim() ||
      me.data.email
    : "";
  const cashierLabel = dr.cashierId
    ? staffOptionName(cashiers.data?.find((o) => String(o.value) === dr.cashierId))
    : "Tất cả";
  const nvbhLabel = dr.salespersonId
    ? staffOptionName(
        salespeople.data?.find((o) => String(o.value) === dr.salespersonId),
      )
    : "Tất cả";
  const receivedByLabel = dr.handover.handedOverToId
    ? staffOptionName(
        cashiers.data?.find(
          (o) => String(o.value) === dr.handover.handedOverToId,
        ),
      )
    : "";

  const buildMeta = (): DailyReportMeta => {
    const fromParts = splitDateTimeVi(dr.issuedAt.from, "from");
    const toParts = splitDateTimeVi(dr.issuedAt.to, "to");
    const rangeText =
      fromParts || toParts
        ? `Từ ${fromParts ? `${fromParts.date} - ${fromParts.time}` : "..."} đến ${
            toParts ? `${toParts.date} - ${toParts.time}` : "..."
          }`
        : "Toàn bộ";
    return {
      branchName,
      addressLine,
      printedAtText: formatPrintedAtVi(new Date()),
      rangeText,
      userName,
      cashierLabel,
      nvbhLabel,
      receivedByLabel,
    };
  };

  const exportMutation = useExportDailySummaryMutation();

  // Tab Doanh thu theo mặt hàng: In/Xuất chưa implement, chỉ báo bằng toast.
  const NOT_IMPLEMENTED_MESSAGE = "Chức năng đang được phát triển";

  const handlePrint = () => {
    if (dr.activeTab !== "summary") {
      toast(NOT_IMPLEMENTED_MESSAGE);
      return;
    }
    if (!dr.summary) return;
    printDailyReport(
      renderDailySummaryPrintHtml(dr.summary, dr.handover, buildMeta()),
    );
  };
  const handleExport = () => {
    if (dr.activeTab !== "summary") {
      toast(NOT_IMPLEMENTED_MESSAGE);
      return;
    }
    exportMutation.mutate(
      {
        issuedAt: dr.issuedAt,
        cashierId: dr.cashierId ?? undefined,
        salespersonId: dr.salespersonId ?? undefined,
        cashierLabel,
        nvbhLabel,
        openingAmount: dr.handover.openingAmount,
        handoverAmount: dr.handover.handoverAmount,
        receivedByLabel,
        note: dr.handover.note,
      },
      { onSuccess: (blob) => exportDailyReportXls(blob) },
    );
  };
  const handlePrintHandover = () => {
    if (!dr.summary) return;
    printDailyReport(
      renderHandoverReceiptPrintHtml(dr.summary, dr.handover, buildMeta()),
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <DailyReportTabs activeTab={dr.activeTab} onChange={dr.setActiveTab} />
      <DailyReportToolbar
        dateRange={dr.dateRange}
        onDateRangeChange={dr.setDateRange}
        issuedAt={dr.issuedAt}
        customRange={dr.customRange}
        onOpenCustomRange={dr.openCustomRange}
        cashierId={dr.cashierId}
        onCashierChange={dr.setCashierId}
        salespersonId={dr.salespersonId}
        onSalespersonChange={dr.setSalespersonId}
        showPrintExport
        onPrint={handlePrint}
        onExport={handleExport}
        showColumnSettings={dr.activeTab === "revenue-by-item"}
        onOpenColumnSettings={dr.openColumnSettings}
      />

      {dr.activeTab === "summary" ? (
        <DailySummaryTab
          summary={dr.summary}
          handover={dr.handover}
          setHandover={dr.setHandover}
          cashCount={dr.cashCount}
          setCashCount={dr.setCashCount}
          cashCountOpen={dr.cashCountOpen}
          openCashCount={dr.openCashCount}
          closeCashCount={dr.closeCashCount}
          onPrint={handlePrintHandover}
          issuedAt={dr.issuedAt}
          cashierId={dr.cashierId}
          salespersonId={dr.salespersonId}
          detailCategory={dr.detailCategory}
          onOpenDetail={dr.openDetail}
          onCloseDetail={dr.closeDetail}
        />
      ) : (
        <RevenueByItemTab
          rows={dr.rows}
          totalsRow={dr.totalsRow}
          loading={dr.revenueLoading}
          page={dr.page}
          pageSize={dr.pageSize}
          total={dr.total}
          totalPages={dr.totalPages}
          onPageChange={dr.setPage}
          onPageSizeChange={dr.setPageSize}
          onRefresh={dr.refetchRevenue}
          visibleColumns={dr.visibleRevenueColumns}
          filters={dr.revenueFilters}
          filterOperators={dr.revenueFilterOperators}
          onFilterChange={dr.setRevenueFilter}
          onFilterOperatorChange={dr.setRevenueFilterOperator}
          columnSettingsOpen={dr.columnSettingsOpen}
          onCloseColumnSettings={dr.closeColumnSettings}
          onApplyVisibleColumns={dr.applyVisibleRevenueColumns}
        />
      )}

      <PosDateRangeCustomDialog
        open={dr.customRangeOpen}
        value={dr.customRange}
        onClose={dr.closeCustomRange}
        onApply={dr.applyCustomRange}
      />
    </div>
  );
}
