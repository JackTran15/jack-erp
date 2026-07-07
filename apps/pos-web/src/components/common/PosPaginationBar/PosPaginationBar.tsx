import { RefreshIcon } from "@erp/pos/components/common/PosIcons/PosIcons";
import { PosSelect } from "@erp/pos/components/common/PosSelect/PosSelect";
import { PosPaginationButton } from "./PosPaginationButton/PosPaginationButton";

export interface PosPaginationBarProps {
  /** 1-based current page index. */
  page: number;
  totalPages: number;
  /** Items per page. */
  pageSize: number;
  /** Total record count. */
  total: number;
  pageSizeOptions?: number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRefresh?: () => void;
}

/**
 * App-shared pagination row shown beneath data tables. Buttons are inert
 * when no callback is supplied — pass handlers from the parent once a real
 * data source is hooked up.
 */
export function PosPaginationBar({
  page,
  totalPages,
  pageSize,
  total,
  pageSizeOptions = [50, 100],
  onPageChange,
  onPageSizeChange,
  onRefresh,
}: PosPaginationBarProps) {
  const atStart = page <= 1;
  const atEnd = page >= totalPages;

  const rangeStart = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(total, page * pageSize);

  return (
    <div className="flex h-10 items-center justify-between gap-2 px-3 text-[14px]">
      <div className="flex items-center gap-1">
        <PosPaginationButton
          ariaLabel="Trang đầu"
          disabled={atStart}
          onClick={() => onPageChange?.(1)}
        >
          «
        </PosPaginationButton>
        <PosPaginationButton
          ariaLabel="Trang trước"
          disabled={atStart}
          onClick={() => onPageChange?.(page - 1)}
        >
          ‹
        </PosPaginationButton>
        <button
          type="button"
          className="inline-flex h-8 min-w-8 items-center justify-center rounded-md bg-[#5C6BC0] px-2 text-[14px] font-semibold text-white"
        >
          {page}
        </button>
        <PosPaginationButton
          ariaLabel="Trang sau"
          disabled={atEnd}
          onClick={() => onPageChange?.(page + 1)}
        >
          ›
        </PosPaginationButton>
        <PosPaginationButton
          ariaLabel="Trang cuối"
          disabled={atEnd}
          onClick={() => onPageChange?.(totalPages)}
        >
          »
        </PosPaginationButton>
        <button
          type="button"
          aria-label="Làm mới"
          onClick={onRefresh}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
        >
          <RefreshIcon size={14} />
        </button>
        <label className="ml-2 inline-flex items-center gap-1 text-[14px] text-gray-500">
          <span className="sr-only">Số dòng/trang</span>
          <PosSelect<number>
            position="top"
            value={pageSizeOptions.includes(pageSize) ? pageSize : null}
            onChange={(next) => onPageSizeChange?.(next)}
            items={pageSizeOptions}
            itemKey={(n) => String(n)}
            renderItem={(n) => String(n)}
            className="w-[72px]"
            triggerClassName="text-[14px] text-gray-700"
          />
        </label>
      </div>

      <div className="text-[14px] text-gray-500">
        {rangeStart}-{rangeEnd}/{total} kết quả
      </div>
    </div>
  );
}
