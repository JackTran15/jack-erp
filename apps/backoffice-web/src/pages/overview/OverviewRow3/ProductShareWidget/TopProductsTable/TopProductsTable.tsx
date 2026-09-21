import { useEffect, useRef } from "react";
import { formatViNumber } from "../../../_lib/format";
import type { TopProductRow } from "../../../_api/overview.interface";

const COLUMNS = "grid-cols-[minmax(0,1fr)_128px_104px_120px]";

interface Props {
  rows: TopProductRow[];
  loading?: boolean;
  error?: boolean;
  onRetry: () => void;
  /** Đổi giá trị này → cuộn danh sách về đầu (vd khi đổi "Sắp xếp theo"). */
  resetScrollKey: string;
}

function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={`grid h-8 items-center gap-2 px-1 ${COLUMNS}`}>
          <span className="h-3 rounded-sm bg-[#EEEEEE]" />
          <span className="h-3 rounded-sm bg-[#EEEEEE]" />
          <span className="h-3 rounded-sm bg-[#EEEEEE]" />
          <span className="h-3 rounded-sm bg-[#EEEEEE]" />
        </div>
      ))}
    </>
  );
}

/** Bảng Top-N "Hàng hóa bán chạy" — chỉ phần thân cuộn, header dính trên. */
export function TopProductsTable({
  rows,
  loading,
  error,
  onRetry,
  resetScrollKey,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [resetScrollKey]);

  return (
    <div className="flex h-[296px] flex-col">
      <div
        className={`grid h-8 shrink-0 items-center border-b border-[#E0E0E0] bg-white px-1 text-[13px] font-bold uppercase leading-5 text-[#212121] ${COLUMNS}`}
      >
        <span className="truncate">Tên hàng hóa</span>
        <span className="truncate">Đơn vị tính</span>
        <span className="text-right">Số lượng</span>
        <span className="text-right">Doanh thu</span>
      </div>

      <div
        ref={bodyRef}
        className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]"
      >
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2">
            <p className="text-[13px] text-[#616161]">Không tải được dữ liệu</p>
            <button
              type="button"
              onClick={onRetry}
              className="text-[13px] font-medium text-[#2B2E6E] underline underline-offset-2"
            >
              Thử lại
            </button>
          </div>
        ) : rows.length === 0 ? (
          <p className="flex h-full items-center justify-center text-[13px] text-[#616161]">
            Không có dữ liệu
          </p>
        ) : (
          rows.map((row) => (
            <div
              key={row.productId}
              className={`grid h-8 items-center px-1 text-[13px] leading-5 text-[#212121] hover:bg-[#F5F6FA] ${COLUMNS}`}
            >
              <span className="truncate">{row.name}</span>
              <span className="truncate">{row.unit}</span>
              <span className="text-right tabular-nums">
                {formatViNumber(row.quantity)}
              </span>
              <span className="text-right tabular-nums">
                {formatViNumber(row.revenue)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
