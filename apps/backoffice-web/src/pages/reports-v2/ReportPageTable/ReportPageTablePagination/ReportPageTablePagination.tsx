import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";

const iconButtonClass =
  "flex h-[22px] w-[22px] items-center justify-center rounded-[2px] border border-[#D9D9DE] bg-white text-[#6B6B75] disabled:opacity-45";

export function ReportPageTablePagination() {
  return (
    <div className="flex h-8 items-center justify-between border-t border-[#E8E8EC] bg-white px-2 text-[12px] text-[#5C5C66]">
      <div className="flex items-center gap-1">
        <button type="button" className={iconButtonClass} aria-label="Trang đầu" disabled>
          <ChevronsLeft className="h-3 w-3" />
        </button>
        <button type="button" className={iconButtonClass} aria-label="Trang trước" disabled>
          <ChevronLeft className="h-3 w-3" />
        </button>
        <span>Trang</span>
        <input
          className="h-[22px] w-9 rounded-[2px] border border-[#D9D9DE] bg-white text-center text-[#212121] outline-none"
          value="1"
          readOnly
        />
        <span>trên 1</span>
        <button type="button" className={iconButtonClass} aria-label="Trang sau" disabled>
          <ChevronRight className="h-3 w-3" />
        </button>
        <button type="button" className={iconButtonClass} aria-label="Trang cuối" disabled>
          <ChevronsRight className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="flex h-[22px] w-[22px] items-center justify-center rounded-[2px] border border-[#D9D9DE] bg-white text-[#2B3164]"
          aria-label="Tải lại"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <select
          className="h-[22px] rounded-[2px] border border-[#D9D9DE] bg-white px-1 text-[#212121] outline-none"
          defaultValue="50"
        >
          <option value="20">20</option>
          <option value="50">50</option>
          <option value="100">100</option>
        </select>
      </div>
      <div>Hiển thị 1 - 1 trên 1 kết quả</div>
    </div>
  );
}
