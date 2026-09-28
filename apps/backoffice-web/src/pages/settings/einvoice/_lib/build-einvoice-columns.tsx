import type { TableColumn } from "../../../../components/table/BaseDataTable";
import { formatEInvoiceCell, formatEInvoiceMoney, type EInvoiceColumnDef } from "./einvoice-columns";
import type { EInvoiceRecord } from "./einvoice.interface";

interface Options {
  /** Tổng "Tổng tiền" của toàn tập đã lọc — ô footer dòng "Tổng". */
  totalAmount: number;
  /** Bấm số hóa đơn → modal "Chi tiết hóa đơn". */
  onOpenDetail: (row: EInvoiceRecord) => void;
}

/** Registry cột → `TableColumn` của BaseDataTable (header 2 dòng, footer Tổng). */
export function buildEInvoiceColumns(
  defs: readonly EInvoiceColumnDef[],
  { totalAmount, onOpenDetail }: Options,
): TableColumn<EInvoiceRecord>[] {
  return defs.map((def, index) => ({
    key: def.key,
    label: def.header,
    width: def.width,
    filterKind: def.filterKind,
    filterOptions: def.filterOptions,
    headerClassName: "whitespace-normal leading-4",
    className: def.align === "right" ? "text-right tabular-nums" : undefined,
    footer:
      def.key === "total" ? (
        <span className="block text-right font-bold tabular-nums">
          {formatEInvoiceMoney(totalAmount)}
        </span>
      ) : index === 0 ? (
        <span className="font-bold">Tổng</span>
      ) : undefined,
    render: (row) =>
      def.key === "invoiceCode" ? (
        <button
          type="button"
          className="text-primary-blue hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onOpenDetail(row);
          }}
        >
          {row.invoiceCode}
        </button>
      ) : (
        formatEInvoiceCell(def, row)
      ),
  }));
}
