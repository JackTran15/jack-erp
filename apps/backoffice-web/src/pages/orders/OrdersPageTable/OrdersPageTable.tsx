import { useMemo } from "react";
import { BaseDataTable } from "../../../components/table/BaseDataTable";
import type { ColumnFilter } from "../../../components/table/pagination.dto";
import {
  RowSelectCheckbox,
  SelectAllCheckbox,
} from "../../../components/document/RowSelectCheckbox";
import {
  useOrdersActions,
  useOrdersStore,
} from "../../../store/page-stores/orders/orders.store";
import { buildOrderColumns } from "../_lib/build-order-columns";
import type { OrderColumnKey } from "../_lib/order-columns";
import type { OrderRow } from "../_mock/orders.mock";

// Ô của cột ghim nằm ĐÈ lên phần lưới đang cuộn ngang, nên nền của nó bắt buộc
// phải ĐỤC. Màu có alpha (vd `bg-info/15`) sẽ để lộ nội dung chạy bên dưới —
// dùng color-mix với nền để ra đúng sắc độ đó mà vẫn đục, giống cách lưới báo
// cáo tô nền dòng (`--row-bg`).
const FOCUSED_ROW_BG =
  "[&>td]:!bg-[color-mix(in_srgb,hsl(var(--info))_18%,hsl(var(--background)))]";
// `&:hover>td` chứ không phải `hover:[&>td]`: cách sau sinh ra `… > td:hover`,
// tức chỉ tô đúng ô đang trỏ chuột thay vì cả dòng.
const HOVER_ROW_BG =
  "[&:hover>td]:!bg-[color-mix(in_srgb,hsl(var(--info))_10%,hsl(var(--background)))]";

interface Props {
  rows: OrderRow[];
  totals: Partial<Record<OrderColumnKey, number>>;
  loading: boolean;
  columnFilterControl: {
    filters: Record<string, ColumnFilter>;
    onModeChange: (key: string, mode: ColumnFilter["mode"]) => void;
    onValueChange: (key: string, value: string) => void;
    onCompareOpChange?: (key: string, op: NonNullable<ColumnFilter["compareOp"]>) => void;
  };
}

export function OrdersPageTable({ rows, totals, loading, columnFilterControl }: Props) {
  const columnPrefs = useOrdersStore((s) => s.columns);
  const focusedOrderId = useOrdersStore((s) => s.focusedOrderId);
  const checkedOrderIds = useOrdersStore((s) => s.checkedOrderIds);
  const { setFocusedOrderId, toggleChecked, setCheckedOrderIds } = useOrdersActions();

  const columns = useMemo(
    () => buildOrderColumns(columnPrefs, totals),
    [columnPrefs, totals],
  );

  const pageIds = rows.map((row) => row.id);
  const checkedOnPage = pageIds.filter((id) => checkedOrderIds.includes(id));
  const allOnPageChecked = pageIds.length > 0 && checkedOnPage.length === pageIds.length;
  const someOnPageChecked = checkedOnPage.length > 0 && !allOnPageChecked;

  const toggleAllOnPage = () =>
    setCheckedOrderIds(
      allOnPageChecked
        ? checkedOrderIds.filter((id) => !pageIds.includes(id))
        : [...new Set([...checkedOrderIds, ...pageIds])],
    );

  return (
    <BaseDataTable
      columns={columns}
      rows={rows}
      loading={loading}
      emptyLabel="Không có dữ liệu."
      getRowKey={(row) => row.id}
      onRowClick={(row) => setFocusedOrderId(row.id)}
      rowClassName={(row) =>
        // Ô của cột ghim nhận `background-color` bằng inline style (BaseDataTable
        // tự tô để cột ghim không trong suốt khi cuộn), mà inline luôn thắng class
        // ở cùng thuộc tính — nên phải dùng `!`. Kèm chiều cao 46px và căn trên
        // như spec.
        [
          "[&>td]:h-[46px] [&>td]:align-top [&>td]:py-2",
          row.id === focusedOrderId ? FOCUSED_ROW_BG : HOVER_ROW_BG,
        ].join(" ")
      }
      leadingColumn={{
        width: 36,
        header: (
          <SelectAllCheckbox
            checked={allOnPageChecked}
            indeterminate={someOnPageChecked}
            disabled={rows.length === 0}
            onToggle={toggleAllOnPage}
          />
        ),
        cell: (row) => (
          <RowSelectCheckbox
            checked={checkedOrderIds.includes(row.id)}
            onToggle={() => toggleChecked(row.id)}
          />
        ),
      }}
      columnFilterControl={columnFilterControl}
    />
  );
}
