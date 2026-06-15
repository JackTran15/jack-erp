import { useQuery } from "@tanstack/react-query";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import { fetchDailySalesSummary } from "../_mock/report-daily-sales.fetcher";
import { ReportPageTableView } from "./ReportPageTableView/ReportPageTableView";
import { ReportPageTablePagination } from "./ReportPageTablePagination/ReportPageTablePagination";

export function ReportPageTable() {
  const tableId = useTableStore((s) => s.tableId);
  const sorting = useTableStore((s) => s.sorting);
  const pagination = useTableStore((s) => s.pagination);
  // Filter gom ở report store: report-level (period/store/date/checkbox) + column filters.
  const reportType = useReportStore((s) => s.reportType);
  const reportFilters = useReportStore((s) => s.filters);
  const columnFilters = useReportStore((s) => s.columnFilters);

  // Nguồn data lấy từ store → fetcher; đổi filter/sort/pagination là refetch & cập nhật table.
  const query = useQuery({
    queryKey: [
      "report-table",
      tableId,
      reportType,
      reportFilters,
      columnFilters,
      sorting,
      pagination,
    ],
    queryFn: () =>
      fetchDailySalesSummary({ columnFilters, reportFilters, sorting, pagination }),
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
