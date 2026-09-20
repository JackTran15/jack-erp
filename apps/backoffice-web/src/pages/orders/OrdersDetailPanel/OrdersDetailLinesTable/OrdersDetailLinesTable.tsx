import { useMemo } from "react";
import {
  BaseDataTable,
  type TableColumn,
} from "../../../../components/table/BaseDataTable";
import { formatOrderMoney } from "../../_lib/order-format";
import type { OrderLineRow } from "../../_mock/orders.mock";

interface Props {
  lines: OrderLineRow[];
  loading: boolean;
  hasFocusedOrder: boolean;
}

/** Hàng hóa của đơn đang focus (tab "Chi tiết", spec 4.6). */
export function OrdersDetailLinesTable({ lines, loading, hasFocusedOrder }: Props) {
  const columns = useMemo<TableColumn<OrderLineRow>[]>(() => {
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalAmount = lines.reduce((sum, line) => sum + line.amount, 0);

    return [
      { key: "sku", label: "Mã SKU", width: 160, render: (row) => row.sku },
      { key: "name", label: "Tên hàng hóa", width: 420, render: (row) => row.name },
      { key: "unit", label: "Đơn vị tính", width: 120, render: (row) => row.unit },
      {
        key: "quantity",
        label: "Số lượng",
        width: 100,
        className: "text-right tabular-nums",
        render: (row) => formatOrderMoney(row.quantity),
        footer: formatOrderMoney(totalQuantity),
      },
      {
        key: "unitPrice",
        label: "Đơn giá",
        width: 120,
        className: "text-right tabular-nums",
        render: (row) => formatOrderMoney(row.unitPrice),
      },
      {
        key: "amount",
        label: "Tiền hàng",
        width: 120,
        className: "text-right tabular-nums",
        render: (row) => formatOrderMoney(row.amount),
        footer: formatOrderMoney(totalAmount),
      },
    ];
  }, [lines]);

  return (
    <BaseDataTable
      columns={columns}
      rows={lines}
      loading={loading}
      emptyLabel={
        hasFocusedOrder
          ? "Đơn hàng này chưa có hàng hóa."
          : "Chọn một đơn hàng để xem chi tiết."
      }
      getRowKey={(row, index) => `${row.sku}-${index}`}
    />
  );
}
