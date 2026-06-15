import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";
import { useTableStore } from "../../../../../store/common/table-store/table.context";
import { PAGE_SIZE_OPTIONS } from "../../../../../store/common/table-store/table.constant";

interface Props {
  total: number;
}

const iconButtonClass =
  "flex h-[22px] w-[22px] items-center justify-center rounded-[2px] border border-border bg-background text-muted-foreground disabled:opacity-45";

export function ReportPageTablePagination({ total }: Props) {
  const pageIndex = useTableStore((s) => s.pagination.pageIndex);
  const pageSize = useTableStore((s) => s.pagination.pageSize);
  const { setPageIndex, setPageSize } = useTableStore((s) => s.paginationActions);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = pageIndex + 1;
  const isFirst = pageIndex <= 0;
  const isLast = pageIndex >= pageCount - 1;
  const from = total === 0 ? 0 : pageIndex * pageSize + 1;
  const to = Math.min(total, (pageIndex + 1) * pageSize);

  return (
    <div className="flex h-8 items-center justify-between border-t border-border bg-background px-2 text-xs text-muted-foreground">
      <div className="flex items-center gap-1">
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Trang đầu"
          disabled={isFirst}
          onClick={() => setPageIndex(0)}
        >
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Trang trước"
          disabled={isFirst}
          onClick={() => setPageIndex(pageIndex - 1)}
        >
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span>Trang</span>
        <input
          className="h-[22px] w-9 rounded-[2px] border border-border bg-background text-center text-foreground outline-none"
          value={currentPage}
          readOnly
        />
        <span>trên {pageCount}</span>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Trang sau"
          disabled={isLast}
          onClick={() => setPageIndex(pageIndex + 1)}
        >
          <ChevronRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          className={iconButtonClass}
          aria-label="Trang cuối"
          disabled={isLast}
          onClick={() => setPageIndex(pageCount - 1)}
        >
          <ChevronsRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[2px] border border-border bg-background text-foreground"
          aria-label="Tải lại"
          onClick={() => setPageIndex(pageIndex)}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <select
          className="h-[22px] rounded-[2px] border border-border bg-background px-1 text-foreground outline-none"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {PAGE_SIZE_OPTIONS.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </div>
      <div>
        Hiển thị {from} - {to} trên {total} kết quả
      </div>
    </div>
  );
}
