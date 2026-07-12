import type { BarcodeLabelRow } from "./barcode-label-row.type";

/**
 * Cắt danh sách dòng in sao cho **tổng số tem** (Σ quantity) không vượt `max` —
 * dùng cho "In thử" (tối đa 2 tem). Duyệt theo thứ tự, lấy trọn từng dòng cho tới
 * khi đủ `max`, dòng cuối bị cắt `quantity` bằng số tem còn lại.
 */
export function capLabels(
  rows: BarcodeLabelRow[],
  max: number,
): BarcodeLabelRow[] {
  const out: BarcodeLabelRow[] = [];
  let remaining = max;
  for (const row of rows) {
    if (remaining <= 0) break;
    const quantity = Math.min(row.quantity, remaining);
    out.push({ ...row, quantity });
    remaining -= quantity;
  }
  return out;
}
