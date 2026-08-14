import type {
  ColumnFilter,
  ColumnFilterMode,
} from "../../../../components/table/pagination.dto";
import type { ReportColumnFilterPayload } from "../../../../api/inventory-reports";

/** Chế độ lọc chuỗi của lưới → toán tử mà backend hiểu (`StringOperator`). */
const TEXT_OPERATOR: Record<ColumnFilterMode, string> = {
  contains: "*",
  equals: "=",
  startsWith: "+",
  endsWith: "-",
  notContains: "!",
};

/**
 * Dịch bộ lọc-theo-cột của lưới sang payload gửi lên server.
 *
 * Cột số dùng toán tử số (`=`, `<=`, `>=`, khoảng) thay vì khớp chuỗi trên số
 * đã định dạng như lưới từng làm phía client — cách cũ chỉ lọc được đúng trang
 * đang xem nên không thể dùng cho tổng toàn tập.
 *
 * @param numericKeys các cột phải so sánh theo số
 * @param keyMap đổi tên khoá cột của lưới sang tên field mà server hiểu, cho
 *   những lưới đặt nhãn cột khác tên field (ví dụ `inTotal` → `inQty`)
 */
export function toColumnFilterPayload(
  filters: Record<string, ColumnFilter>,
  numericKeys: ReadonlySet<string>,
  keyMap: Readonly<Record<string, string>> = {},
): Record<string, ReportColumnFilterPayload> {
  const out: Record<string, ReportColumnFilterPayload> = {};

  for (const [gridKey, filter] of Object.entries(filters)) {
    if (!filter) continue;
    const key = keyMap[gridKey] ?? gridKey;

    const from = filter.from?.trim();
    const to = filter.to?.trim();
    if (from || to) {
      out[key] = { ...(from ? { from } : {}), ...(to ? { to } : {}) };
      continue;
    }

    const value = filter.value?.trim();
    if (!value) continue;

    out[key] = numericKeys.has(gridKey)
      ? { operator: filter.compareOp ?? "=", value }
      : { operator: TEXT_OPERATOR[filter.mode] ?? "*", value };
  }

  return out;
}
