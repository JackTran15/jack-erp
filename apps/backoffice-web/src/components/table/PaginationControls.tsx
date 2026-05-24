import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react";
import { Button } from "@erp/ui";
import { TABLE_PAGE_SIZE_OPTIONS, clampPage } from "./pagination.dto";

interface PaginationControlsProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextPageSize: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
  onRefresh?: () => void;
  /** API không trả tổng — bật next theo hasMore, tắt nhảy trang cuối. */
  hasMore?: boolean;
  totalEstimated?: boolean;
  disabled?: boolean;
  /** Số dòng trên trang hiện tại (khi totalEstimated). */
  pageItemCount?: number;
}

export function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = TABLE_PAGE_SIZE_OPTIONS,
  className,
  onRefresh,
  hasMore = false,
  totalEstimated = false,
  disabled = false,
  pageItemCount,
}: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const pageEnd =
    total === 0
      ? 0
      : totalEstimated
        ? pageItemCount != null
          ? (page - 1) * pageSize + pageItemCount
          : pageStart
        : Math.min(page * pageSize, total);
  const canPrev = !disabled && page > 1;
  const canNext = !disabled && (page < totalPages || (totalEstimated && hasMore));
  const canLast = !disabled && !totalEstimated && page < totalPages;

  return (
    <div className={`flex flex-col gap-1.5 border-t border-border bg-background px-3 py-2.5 ${className ?? ""}`}>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-sm p-0"
            disabled={!canPrev}
            onClick={() => onPageChange(1)}
            aria-label="Trang đầu"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-sm p-0"
            disabled={!canPrev}
            onClick={() => onPageChange(page - 1)}
            aria-label="Trang trước"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <span>Trang</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={totalPages}
            aria-label="Số trang"
            className="h-8 w-12 rounded-sm border border-input bg-background px-1 text-center text-sm tabular-nums outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-blue-500/35"
            value={page}
            disabled={disabled}
            onChange={(event) => {
              const raw = event.target.value;
              if (raw === "") return;
              const next = Number.parseInt(raw, 10);
              if (!Number.isFinite(next)) return;
              onPageChange(clampPage(next, totalPages));
            }}
          />
          <span className="text-muted-foreground">trên {totalPages}</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-sm p-0"
            disabled={!canNext}
            onClick={() => onPageChange(page + 1)}
            aria-label="Trang sau"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-sm p-0"
            disabled={!canLast}
            onClick={() => onPageChange(totalPages)}
            aria-label="Trang cuối"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-8 shrink-0 rounded-sm p-0"
            onClick={onRefresh}
            disabled={disabled}
            aria-label="Tải lại danh sách"
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
          </Button>
        ) : null}
        {onPageSizeChange ? (
          <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="sr-only">Số dòng mỗi trang</span>
            <select
              className="h-8 rounded-sm border border-input bg-background px-2 text-sm font-medium tabular-nums"
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number.parseInt(event.target.value, 10))}
              disabled={disabled}
            >
              {pageSizeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      <p className="text-right text-sm text-muted-foreground">
        {total === 0
          ? "Không có kết quả"
          : totalEstimated
            ? pageEnd === 0
              ? "Không có kết quả"
              : `Hiển thị ${pageStart} - ${pageEnd}${hasMore ? "+" : ""}`
            : `Hiển thị ${pageStart} - ${pageEnd} trên ${total.toLocaleString("vi-VN")} kết quả`}
      </p>
    </div>
  );
}
