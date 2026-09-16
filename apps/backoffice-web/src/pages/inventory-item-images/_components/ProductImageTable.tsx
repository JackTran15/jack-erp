import type { ReactNode } from "react";
import { Button } from "@erp/ui";
import { ImageOff } from "lucide-react";
import type { ProductImageRow } from "../_lib/product-images.api";

const SKELETON_ROWS = 8;

interface Props {
  rows: ProductImageRow[];
  loading: boolean;
  /** Thông điệp lỗi (đã là tiếng người dùng); null khi không lỗi. */
  errorMessage: string | null;
  onRetry: () => void;
  /** Nút hành động ở cột Ảnh (nút "Tải ảnh" của dòng). */
  renderRowAction: (row: ProductImageRow) => ReactNode;
}

const HEADER_CELL =
  "border-b px-3 py-2 text-left text-xs font-medium text-muted-foreground";
const CELL = "border-b px-3 py-2 align-middle";

interface ImageCellProps {
  row: ProductImageRow;
}

function ImageCell({ row }: ImageCellProps) {
  if (row.thumbnailUrl) {
    return (
      <img
        src={row.thumbnailUrl}
        alt={row.code}
        loading="lazy"
        className="h-16 w-16 rounded border bg-background object-contain"
      />
    );
  }
  return (
    <div
      className="flex h-16 w-16 items-center justify-center rounded border bg-muted text-muted-foreground"
      aria-label="Chưa có ảnh"
    >
      <ImageOff className="h-6 w-6" aria-hidden />
    </div>
  );
}

/** Bảng Mã SKU · Tên hàng hóa · Nhóm hàng hóa · Ảnh của trang Cập nhật ảnh. */
export function ProductImageTable({
  rows,
  loading,
  errorMessage,
  onRetry,
  renderRowAction,
}: Props) {
  const showSkeleton = loading && rows.length === 0;

  return (
    <table className="w-full border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-muted text-left [&_th]:bg-muted">
        <tr>
          <th className={`w-48 ${HEADER_CELL}`}>Mã SKU</th>
          <th className={HEADER_CELL}>Tên hàng hóa</th>
          <th className={`w-60 ${HEADER_CELL}`}>Nhóm hàng hóa</th>
          <th className={`w-56 ${HEADER_CELL}`}>Ảnh</th>
        </tr>
      </thead>
      <tbody>
        {errorMessage ? (
          <tr>
            <td colSpan={4} className="px-3 py-10 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                Thử lại
              </Button>
            </td>
          </tr>
        ) : showSkeleton ? (
          Array.from({ length: SKELETON_ROWS }, (_, i) => (
            <tr key={`skeleton-${i}`} aria-hidden>
              <td className={CELL}>
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              </td>
              <td className={CELL}>
                <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              </td>
              <td className={CELL}>
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              </td>
              <td className={CELL}>
                <div className="h-16 w-16 animate-pulse rounded bg-muted" />
              </td>
            </tr>
          ))
        ) : rows.length === 0 ? (
          <tr>
            <td
              colSpan={4}
              className="px-3 py-10 text-center text-sm text-muted-foreground"
            >
              Không có hàng hóa phù hợp
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={`${row.type}:${row.id}`}
              className={loading ? "opacity-60" : undefined}
            >
              <td className={`${CELL} font-medium text-foreground`}>
                {row.code}
              </td>
              <td className={CELL}>{row.name}</td>
              <td className={`${CELL} text-muted-foreground`}>
                {row.categoryName ?? "—"}
              </td>
              <td className={CELL}>
                <div className="flex items-center gap-3">
                  <ImageCell row={row} />
                  {renderRowAction(row)}
                </div>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}
