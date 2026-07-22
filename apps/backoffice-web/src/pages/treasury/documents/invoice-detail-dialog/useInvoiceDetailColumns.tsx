import { formatMoneyInteger } from "@erp/ui";
import { useMemo } from "react";
import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { TABLE_NUM_CLASS } from "../../ledger-cash/ledger-cash.constants";
import type {
  LedgerCashInvoiceDetail,
  LedgerCashInvoiceLine,
} from "../../ledger-cash/ledger-cash.types";

export function useInvoiceDetailColumns(detail: LedgerCashInvoiceDetail | null) {
  const columns: TableColumn<LedgerCashInvoiceLine & { index: number }>[] =
    useMemo(
      () => [
        {
          key: "index",
          label: "STT",
          width: 48,
          filterKind: "none",
          render: (r) => r.index,
        },
        { key: "sku", label: "Mã SKU", width: 120, render: (r) => r.sku },
        { key: "name", label: "Tên hàng hóa", width: 200, render: (r) => r.name },
        { key: "unit", label: "ĐVT", width: 72, render: (r) => r.unit },
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
        {
          key: "lineAmount",
          label: "Tiền hàng",
          width: 110,
          headerClassName: "text-right",
          className: TABLE_NUM_CLASS,
          render: (r) => formatMoneyInteger(r.lineAmount),
        },
        {
          key: "discountAmount",
          label: "Tiền KM",
          width: 96,
          headerClassName: "text-right",
          className: TABLE_NUM_CLASS,
          render: (r) => formatMoneyInteger(r.discountAmount),
        },
        {
          key: "totalAmount",
          label: "Thành tiền",
          width: 110,
          headerClassName: "text-right",
          className: TABLE_NUM_CLASS,
          render: (r) => formatMoneyInteger(r.totalAmount),
        },
        {
          key: "note",
          label: "Ghi chú",
          width: 100,
          render: (r) => r.note ?? "",
        },
      ],
      [],
    );

  const lineRows = useMemo(() => {
    if (!detail) return [];
    return detail.lines.map((line, i) => ({ ...line, index: i + 1 }));
  }, [detail]);

  const qtyTotal = useMemo(
    () => lineRows.reduce((sum, r) => sum + r.quantity, 0),
    [lineRows],
  );

  const columnsWithFooter = useMemo(
    () =>
      columns.map((c) =>
        c.key === "quantity"
          ? {
              ...c,
              footer: (
                <span className="font-semibold">
                  {qtyTotal.toLocaleString("vi-VN")}
                </span>
              ),
            }
          : c,
      ),
    [columns, qtyTotal],
  );

  return { columnsWithFooter, lineRows };
}
