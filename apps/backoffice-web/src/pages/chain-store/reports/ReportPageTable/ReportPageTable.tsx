import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getReportBackendKey } from "../../../../constants/reports/report-type.constant";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import {
  buildColumnFilters,
  buildSearchFilters,
  fetchReportData,
  mapDataRows,
  mapTotals,
} from "../_api/invoice-report.api";
import { ReportPageTableView } from "./ReportPageTableView/ReportPageTableView";
import { ReportPageTablePagination } from "./ReportPageTablePagination/ReportPageTablePagination";

export function ReportPageTable() {
  const config = useTableStore((s) => s.config);
  const pagination = useTableStore((s) => s.pagination);
  const appliedRequest = useReportStore((s) => s.appliedRequest);

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

  const backendKey = appliedRequest
    ? getReportBackendKey(appliedRequest.reportType)
    : undefined;

  // Data chỉ fetch khi đã áp dụng (Lấy dữ liệu/Đồng ý) + report type được BE hỗ trợ + đã có cột.
  const enabled = Boolean(appliedRequest && backendKey && columnIds.length > 0);

  const query = useQuery({
    queryKey: [
      "report-data",
      backendKey,
      appliedRequest,
      columnIds,
      pagination.pageIndex,
      pagination.pageSize,
    ],
    queryFn: () =>
      fetchReportData({
        reportType: backendKey as string,
        columns: columnIds,
        filters: buildSearchFilters(appliedRequest!.filters),
        columnFilters: buildColumnFilters(appliedRequest!.columnFilters, numericCols),
        page: pagination.pageIndex + 1,
        limit: pagination.pageSize,
      }),
    enabled,
    placeholderData: (prev) => prev,
  });

  const rows = query.data ? mapDataRows(query.data.dataRaw) : [];
  const totals = mapTotals(query.data?.totals ?? null);
  const total = query.data?.total ?? 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <ReportPageTableView rows={rows} totals={totals} />
      <ReportPageTablePagination total={total} />
    </div>
  );
}
