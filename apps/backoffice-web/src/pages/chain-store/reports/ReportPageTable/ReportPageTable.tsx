import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useBranchStore } from "../../../../store/common/branch/branch.store";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import { getReportDataFetcher } from "../_api/report-data-source";
import { ReportPageTableView } from "./ReportPageTableView/ReportPageTableView";
import { ReportPageTablePagination } from "./ReportPageTablePagination/ReportPageTablePagination";

export function ReportPageTable() {
  const config = useTableStore((s) => s.config);
  const pagination = useTableStore((s) => s.pagination);
  const appliedRequest = useReportStore((s) => s.appliedRequest);
  const reloadNonce = useReportStore((s) => s.reloadNonce);
  const branch = useReportStore((s) => s.branch);
  const activeBranchId = useBranchStore((s) => s.branchId);

  const columnIds = useMemo(
    () => config.columns.map((c) => c.column),
    [config.columns],
  );
  const numericCols = useMemo(
    () =>
      new Set(
        config.columns
          .filter((c) => (c.tableConfig?.dataType ?? "number") === "number")
          .map((c) => c.column),
      ),
    [config.columns],
  );

  const fetcher = appliedRequest
    ? getReportDataFetcher(appliedRequest.reportType)
    : undefined;

  // Data chỉ fetch khi đã áp dụng (Đồng ý) + report có nguồn data + đã có cột
  // ĐÚNG của báo cáo đang xem. Đổi report type ghi `appliedRequest` ngay
  // (report store) nhưng `config` chỉ đổi khi catalog cột của type mới về
  // (ReportTableConfigSync) — bắn giữa hai mốc đó là gửi cột báo cáo cũ kèm
  // type mới, BE trả 400 "Unknown report columns". Dấu type trên config khoá
  // đúng cửa sổ đó; hàng cũ vẫn hiển thị nhờ `placeholderData`.
  const enabled = Boolean(
    appliedRequest &&
      fetcher &&
      columnIds.length > 0 &&
      config.reportType === appliedRequest.reportType,
  );

  const query = useQuery({
    queryKey: [
      "report-data",
      appliedRequest,
      reloadNonce,
      branch,
      activeBranchId,
      columnIds,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      fetcher!({
        reportType: appliedRequest!.reportType,
        branch,
        activeBranchId,
        filters: appliedRequest!.filters,
        columnFilters: appliedRequest!.columnFilters,
        columns: columnIds,
        numericCols,
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
      }),
    enabled,
    placeholderData: (prev) => prev,
  });

  const rows = query.data?.rows ?? [];
  const totals = query.data?.totals ?? {};
  const total = query.data?.total ?? 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportPageTableView rows={rows} totals={totals} />
      <ReportPageTablePagination total={total} />
    </div>
  );
}
