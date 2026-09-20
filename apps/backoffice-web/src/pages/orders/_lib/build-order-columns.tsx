import type { ReactNode } from "react";
import { Badge } from "@erp/ui";
import type { TableColumn } from "../../../components/table/BaseDataTable";
import type { OrdersColumnPrefs } from "../../../store/page-stores/orders/orders.interface";
import type { OrderRow } from "../_mock/orders.mock";
import {
  ORDER_COLUMN_BY_KEY,
  type OrderColumnDef,
  type OrderColumnKey,
} from "./order-columns";
import { formatOrderDate, formatOrderMoney } from "./order-format";

const ALIGN_CLASS: Record<NonNullable<OrderColumnDef["align"]>, string> = {
  left: "text-left",
  right: "text-right tabular-nums",
  center: "text-center",
};

function renderCell(column: OrderColumnDef, row: OrderRow): ReactNode {
  const value = row[column.key];

  switch (column.renderer) {
    case "date":
      return formatOrderDate(String(value ?? ""));
    case "money":
      return formatOrderMoney(typeof value === "number" ? value : 0);
    case "statusLink":
      return value ? <span className="text-info">{String(value)}</span> : null;
    case "invoiceLink":
      return value ? (
        <span className="text-primary-blue hover:underline">{String(value)}</span>
      ) : null;
    case "multiline":
      // Giá trị mock dùng "\n" làm ngắt dòng thật (vd "300 (g)" / kích thước gói);
      // `whitespace-pre-line` trên ô sẽ dựng lại 2 dòng.
      return String(value ?? "");
    case "tags":
      return (
        <div className="flex flex-wrap items-start gap-1">
          {(Array.isArray(value) ? value : []).map((tag) => (
            <Badge key={tag} variant="secondary" className="rounded-sm font-normal">
              {tag}
            </Badge>
          ))}
        </div>
      );
    default:
      return String(value ?? "");
  }
}

/**
 * Dựng cột cho `BaseDataTable` từ registry + thiết lập của người dùng.
 *
 * Ẩn/hiện, thứ tự và ghim đều chỉ là phép biến đổi trên một mảng thường, nên
 * dialog "Cài đặt cột" chỉ cần ghi `OrdersColumnPrefs` là lưới tự đổi theo.
 */
export function buildOrderColumns(
  prefs: OrdersColumnPrefs,
  totals: Partial<Record<OrderColumnKey, number>>,
): TableColumn<OrderRow>[] {
  const frozen = new Set(prefs.frozen);

  const visible = prefs.order
    .filter((key) => prefs.visibility[key] !== false)
    .map((key) => ORDER_COLUMN_BY_KEY.get(key))
    .filter((column): column is OrderColumnDef => Boolean(column));

  // Cột ghim phải nằm liền khối ở đầu mảng: `computeFrozenOffsets` của
  // BaseDataTable duyệt theo thứ tự mảng nhưng chỉ cộng dồn bề rộng của cột
  // ghim, nên một cột ghim đứng sau cột thường sẽ nhận `left` như thể khối ghim
  // là liền mạch — và đè lên cột khác. Chuẩn hoá tại đây, nơi duy nhất dựng cột.
  const ordered = [
    ...visible.filter((column) => frozen.has(column.key)),
    ...visible.filter((column) => !frozen.has(column.key)),
  ];

  return ordered
    .map((column) => ({
      key: column.key,
      label: column.header,
      width: column.width,
      // `column.className` được cn() nối SAU class mặc định của ô, nên
      // `whitespace-pre-line` thắng `whitespace-nowrap` của `truncate` — đủ để
      // hai cột địa chỉ / gói hàng xuống dòng đúng như spec.
      className: [
        ALIGN_CLASS[column.align ?? "left"],
        column.renderer === "multiline" ? "whitespace-pre-line align-top" : "",
      ]
        .filter(Boolean)
        .join(" "),
      headerClassName: "text-center",
      frozen: frozen.has(column.key),
      filterKind: column.filterKind,
      filterOptions: column.filterOptions,
      filterPlaceholder: column.filterKind === "select" ? "Tất cả" : undefined,
      render: (row: OrderRow) => renderCell(column, row),
      footer:
        column.summary === "sum"
          ? formatOrderMoney(totals[column.key] ?? 0)
          : undefined,
    }));
}
