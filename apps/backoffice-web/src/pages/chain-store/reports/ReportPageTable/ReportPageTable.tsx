import { useQuery } from "@tanstack/react-query";
import { useTableStore } from "../../../../store/common/table-store/table.context";
import { fetchDailySalesSummary } from "../_mock/report-daily-sales.fetcher";
import { ReportPageTableView } from "./ReportPageTableView/ReportPageTableView";
import { ReportPageTablePagination } from "./ReportPageTablePagination/ReportPageTablePagination";

export function ReportPageTable() {
  const tableId = useTableStore((s) => s.tableId);
  const filters = useTableStore((s) => s.filters);
  const sorting = useTableStore((s) => s.sorting);
  const pagination = useTableStore((s) => s.pagination);

  // Nguồn data lấy từ store → fetcher; đổi filter/sort/pagination là refetch & cập nhật table.
  const query = useQuery({
    queryKey: ["report-table", tableId, filters, sorting, pagination],
    queryFn: () => fetchDailySalesSummary({ filters, sorting, pagination }),
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
