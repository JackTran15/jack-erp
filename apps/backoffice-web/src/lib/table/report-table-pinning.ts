import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import type { ReportTableSegment } from "./report-table";

// Vị trí sticky của cột được ghim (offset px lấy từ TanStack pinning).
export function pinPosition<T>(column: Column<T>): CSSProperties {
  const pinned = column.getIsPinned();
  if (pinned === "left") return { position: "sticky", left: column.getStart("left") };
  if (pinned === "right") return { position: "sticky", right: column.getAfter("right") };
  return {};
}

// Sticky cho header tier-1 của group: chỉ khi toàn bộ leaf của group cùng ghim một phía.
export function groupPinPosition<T>(
  seg: Extract<ReportTableSegment, { kind: "group" }>,
  columnById: Map<string, Column<T>>,
): CSSProperties {
  const cols = seg.cols
    .map((c) => columnById.get(c.column))
    .filter((c): c is Column<T> => Boolean(c));
  if (cols.length === 0) return {};
  if (cols.every((c) => c.getIsPinned() === "left")) {
    return { position: "sticky", left: cols[0].getStart("left") };
  }
  if (cols.every((c) => c.getIsPinned() === "right")) {
    return { position: "sticky", right: cols[cols.length - 1].getAfter("right") };
  }
  return {};
}

// Bọc sticky dọc lên style ghim ngang của một ô. Phải merge vào cùng object style chứ không
// thêm class `sticky top-0`: pinPosition đặt `position` bằng inline style, mà inline luôn
// thắng class ở cùng property → class sẽ chết đúng trên các cột ghim (ADR-01).
// Ô ghim luôn nhận z cao hơn ô thường để khi cuộn ngang nó đè lên phần còn lại của cùng hàng
// (ADR-02); đây là chỗ duy nhất quyết định z, call site không tự đặt.
export function withStickyTop(
  pin: CSSProperties,
  top: number,
  z: number,
  zPinned: number,
): CSSProperties {
  return { ...pin, position: "sticky", top, zIndex: pin.position ? zPinned : z };
}

export function withStickyBottom(
  pin: CSSProperties,
  z: number,
  zPinned: number,
): CSSProperties {
  return { ...pin, position: "sticky", bottom: 0, zIndex: pin.position ? zPinned : z };
}
