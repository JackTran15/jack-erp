import type {
  ColumnFilterSelectOption,
  TableColumn,
} from "../../components/table/BaseDataTable";
import type { StockBalanceRow } from "../../api/stock-balances";
import type { StockByLocationItem } from "@erp/shared-interfaces";

function displayLocationName(row: StockBalanceRow): string {
  if (row.location.code === "__UNASSIGNED__") return "Chưa xếp";
  return row.location.name || "—";
}

export function buildItemLocationColumns(
  rowIndexMap: Map<string, number>,
  storageOptions: ColumnFilterSelectOption[],
): TableColumn<StockBalanceRow>[] {
  return [
    {
      key: "index",
      label: "STT",
      width: 60,
      headerClassName: "text-center",
      className: "text-center text-muted-foreground tabular-nums",
      filterKind: "none",
      render: (r) => rowIndexMap.get(r.id) ?? "",
    },
    {
      key: "locationName",
      label: "Tên vị trí",
      width: 150,
      filterKind: "symbol",
      render: displayLocationName,
    },
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 150,
      filterKind: "symbol",
      className: "font-mono",
      render: (r) => r.item.code,
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 260,
      filterKind: "symbol",
      render: (r) => r.item.name,
    },
    {
      key: "quantity",
      label: "Số lượng",
      width: 110,
      filterKind: "symbol",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => Number(r.quantity).toLocaleString("vi-VN"),
    },
    {
      key: "categoryName",
      label: "Nhóm hàng hóa",
      width: 160,
      filterKind: "symbol",
      render: (r) => r.item.categoryName ?? "",
    },
    {
      key: "unit",
      label: "ĐVT",
      width: 80,
      filterKind: "symbol",
      render: (r) => r.item.unit,
    },
    {
      key: "storageId",
      label: "Kho",
      width: 180,
      filterKind: "select",
      filterOptions: storageOptions,
      render: (r) => r.location.storageName,
    },
  ];
}

export function buildLocationStockItemColumns(
  rowIndexMap: Map<string, number>,
): TableColumn<StockByLocationItem>[] {
  return [
    {
      key: "index",
      label: "STT",
      width: 60,
      headerClassName: "text-center",
      className: "text-center text-muted-foreground tabular-nums",
      filterKind: "none",
      render: (r) => rowIndexMap.get(r.itemId) ?? "",
    },
    {
      key: "itemCode",
      label: "Mã SKU",
      width: 150,
      filterKind: "symbol",
      className: "font-mono",
      render: (r) => r.code,
    },
    {
      key: "itemName",
      label: "Tên hàng hóa",
      width: 280,
      filterKind: "symbol",
      render: (r) => (
        <span>
          {r.name}
          {r.variantLabel ? (
            <span className="ml-1 text-xs text-muted-foreground">
              ({r.variantLabel})
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "quantity",
      label: "Số lượng",
      width: 110,
      filterKind: "none",
      headerClassName: "text-right",
      className: "text-right tabular-nums",
      render: (r) => Number(r.quantity).toLocaleString("vi-VN"),
    },
    {
      key: "categoryName",
      label: "Nhóm hàng hóa",
      width: 180,
      filterKind: "none",
      render: (r) => r.categoryName ?? "",
    },
    {
      key: "unit",
      label: "ĐVT",
      width: 80,
      filterKind: "none",
      render: (r) => r.unit,
    },
  ];
}
