import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { TABLE_NUM_CLASS } from "../../ledger-cash/ledger-cash.constants";
import type { LedgerCashVoucherSkuLine } from "../../ledger-cash/ledger-cash.types";

export function usePaymentVoucherSkuColumns(includeLocation: boolean) {
  return useMemo((): TableColumn<LedgerCashVoucherSkuLine>[] => {
    const cols: TableColumn<LedgerCashVoucherSkuLine>[] = [
      { key: "sku", label: "Mã SKU", width: 100, render: (r) => r.sku },
      { key: "name", label: "Tên hàng hóa", width: 160, render: (r) => r.name },
      { key: "warehouse", label: "Kho", width: 120, render: (r) => r.warehouse },
    ];
    if (includeLocation) {
      cols.push({
        key: "location",
        label: "Vị trí",
        width: 100,
        render: (r) => r.location ?? "",
      });
    }
    cols.push(
      { key: "unit", label: "Đơn vị tính", width: 88, render: (r) => r.unit },
      {
        key: "quantity",
        label: "Số lượng",
        width: 88,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => r.quantity.toLocaleString("vi-VN"),
      },
      {
        key: "unitPrice",
        label: "Đơn giá",
        width: 110,
        headerClassName: "text-right",
        className: TABLE_NUM_CLASS,
        render: (r) => formatMoneyInteger(r.unitPrice),
      },
    );
    return cols;
  }, [includeLocation]);
}
