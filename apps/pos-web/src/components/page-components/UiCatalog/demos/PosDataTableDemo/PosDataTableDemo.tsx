import { cn, formatVnd } from "@erp/ui";
import {
  PosDataTable,
  type PosDataTableColumn,
} from "@erp/pos/components/common/PosDataTable/PosDataTable";
import { PosDataTableFilterCell } from "@erp/pos/components/common/PosDataTable/PosDataTableFilterCell/PosDataTableFilterCell";
import {
  FilterOperatorEnum,
  FilterOperatorTypeEnum,
} from "@erp/pos/constants/checkout.constant";
import type { CatalogEntry } from "@erp/pos/components/page-components/UiCatalog/ui-catalog.types";

interface OrderLine {
  id: string;
  code: string;
  name: string;
  qty: number;
  amount: number;
}

const ROWS: OrderLine[] = [
  { id: "1", code: "SP-001", name: "Cà phê sữa đá", qty: 2, amount: 50000 },
  { id: "2", code: "SP-002", name: "Trà đào cam sả", qty: 1, amount: 45000 },
  { id: "3", code: "SP-003", name: "Bạc xỉu", qty: 3, amount: 90000 },
];

const COLUMNS: PosDataTableColumn<OrderLine>[] = [
  { key: "code", title: "Mã", render: (r) => r.code },
  {
    key: "name",
    title: "Tên hàng",
    render: (r) => r.name,
    filterRender: (
      <PosDataTableFilterCell
        operatorType={FilterOperatorTypeEnum.TEXT}
        leadingOperator={FilterOperatorEnum.CONTAINS}
        placeholder="Lọc tên"
      />
    ),
  },
  { key: "qty", title: "SL", align: "right", render: (r) => r.qty },
  {
    key: "amount",
    title: "Thành tiền",
    align: "right",
    cellClassName: "tabular-nums",
    render: (r) => formatVnd(r.amount),
  },
];

export const PosDataTableDemo = () => {
  const total = ROWS.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200">
      <PosDataTable<OrderLine>
        columns={COLUMNS}
        dataSource={ROWS}
        rowKey={(r) => r.id}
        emptyText="Chưa có dòng hàng"
        hasBorder
        summaryRow={
          <tr className="border-t border-gray-200">
            <td className="px-3 py-2 text-[13px] font-semibold" colSpan={3}>
              Tổng cộng
            </td>
            <td className={cn("px-3 py-2 text-right text-[14px] font-bold tabular-nums")}>
              {formatVnd(total)}
            </td>
          </tr>
        }
      />
    </div>
  );
};

export const posDataTableEntry: CatalogEntry = {
  id: "pos-data-table",
  name: "PosDataTable",
  category: "display",
  importPath: "@erp/pos/components/common/PosDataTable/PosDataTable",
  description:
    "Bảng dữ liệu theo cột (generic, thuần hiển thị). Hỗ trợ hàng lọc phụ (filterRender), hàng tổng (summaryRow) và empty-state. Phân trang/filter do component cha quản lý.",
  props: [
    { name: "columns", type: "ReadonlyArray<PosDataTableColumn<TData>>", required: true, description: "Định nghĩa cột: { key, title, render, align?, filterRender?, … }." },
    { name: "dataSource", type: "ReadonlyArray<TData>", required: true, description: "Dữ liệu các hàng." },
    { name: "rowKey", type: "(row: TData) => string", required: true, description: "Khoá React cho mỗi hàng." },
    { name: "emptyText", type: "string", required: true, description: "Văn bản khi không có dữ liệu." },
    { name: "summaryRow", type: "ReactNode", required: false, description: "Nội dung <tfoot> (vd dòng tổng)." },
    { name: "rowClassName", type: "(row: TData) => string | undefined", required: false, description: "Class theo từng hàng." },
    { name: "hasBorder", type: "boolean", required: false, defaultValue: "true", description: "Có viền ngăn hàng." },
    { name: "fillHeight", type: "boolean", required: false, defaultValue: "false", description: "Kéo dãn bảng để dòng tổng nằm dưới cùng." },
  ],
  usageNotes: [
    "Thuần hiển thị — không tự lo phân trang. Bọc thêm PosPaginationBar khi cần.",
    "Đặt filterRender ở cột để hiện hàng lọc phụ (vd PosDataTableFilterCell).",
    "summaryRow nhận <tr> trong <tfoot> — tự canh colSpan cho khớp số cột.",
  ],
  code: `const columns: PosDataTableColumn<OrderLine>[] = [
  { key: "code", title: "Mã", render: (r) => r.code },
  { key: "amount", title: "Thành tiền", align: "right", render: (r) => formatVnd(r.amount) },
];

<PosDataTable
  columns={columns}
  dataSource={rows}
  rowKey={(r) => r.id}
  emptyText="Chưa có dòng hàng"
/>`,
  Demo: PosDataTableDemo,
};
