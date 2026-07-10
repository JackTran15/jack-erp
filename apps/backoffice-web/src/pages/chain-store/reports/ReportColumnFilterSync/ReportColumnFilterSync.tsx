import { useEffect, useRef } from "react";
import { useReportStore } from "../../../../store/page-stores/report/report.context";
import { useTableStore } from "../../../../store/common/table-store/table.context";

const COLUMN_FILTER_DEBOUNCE_MS = 400;

// Áp dụng live filter cột (dòng đầu bảng): sau khi ngừng gõ ~400ms thì commit
// vào appliedRequest để table refetch, và về trang đầu. Header filter vẫn theo nút.
export function ReportColumnFilterSync() {
  const columnFilters = useReportStore((s) => s.columnFilters);
  const commitColumnFilters = useReportStore((s) => s.actions.commitColumnFilters);
  const setPageIndex = useTableStore((s) => s.paginationActions.setPageIndex);
  const mounted = useRef(false);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true; // bỏ qua lần mount đầu (chưa có thao tác người dùng)
      return;
    }
    const t = setTimeout(() => {
      setPageIndex(0); // filter thu hẹp kết quả -> tránh kẹt ở trang trống
      commitColumnFilters();
    }, COLUMN_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [columnFilters, commitColumnFilters, setPageIndex]);

  return null;
}
